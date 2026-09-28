import {
  applySchema,
  applyWeightSchema,
  insertFacetCatalog,
  insertSampleRecordings,
  insertWeights,
  withTransaction,
  type SqlClient,
} from '../corpus/export.js';
import { WEIGHT_TABLES } from '../corpus/schema.js';
import { buildWeights, type StreamableRecording } from '../corpus/weights.js';
import { buildDerivedTables, decadeOf } from '../corpus/sample.js';

const SCRATCH_SCHEMA = 'weights_next';
const SWAP_ATTEMPTS = 5;

/**
 * Recompute the tempered prefix-sum weight index from the current streamable
 * corpus and swap it into place. The new tables are built in a scratch schema
 * where readers never look, then moved into public in one short transaction,
 * so a spin waits milliseconds for the swap instead of minutes for the load.
 * Run on its own (daily) cadence because it is O(corpus).
 */
export async function rebuildWeights(client: SqlClient): Promise<{ recordings: number }> {
  await applySchema(client);

  const { rows } = await client.query(
    `SELECT r.id AS recording_id, r.artist_id, r.release_group_id, r.genres,
            r.year, r.language, a.country
     FROM recording r JOIN artist a ON a.id = r.artist_id`,
  );

  const streamable: StreamableRecording[] = rows.map((row) => ({
    recordingId: String(row.recording_id),
    artistId: String(row.artist_id),
    releaseGroupId: String(row.release_group_id),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
    decade: decadeOf(row.year == null ? null : Number(row.year)),
    country: row.country == null ? null : String(row.country),
    language: row.language == null ? null : String(row.language),
  }));

  const weights = buildWeights(streamable);
  const { sampleRecordings, facetCatalog } = buildDerivedTables(streamable);

  await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${SCRATCH_SCHEMA}`);
  await withTransaction(client, async (tx) => {
    await tx.query(`SET LOCAL search_path TO ${SCRATCH_SCHEMA}`);
    await applyWeightSchema(tx);
    await insertWeights(tx, weights);
    await insertSampleRecordings(tx, sampleRecordings);
    await insertFacetCatalog(tx, facetCatalog);
    // Planner statistics travel with the table, so the swapped-in copy plans
    // well from its first query.
    for (const table of WEIGHT_TABLES) await tx.query(`ANALYZE ${table}`);
  });

  await swapIntoPublic(client);
  await client.query(`DROP SCHEMA ${SCRATCH_SCHEMA}`);

  return { recordings: streamable.length };
}

/**
 * Replace the live weight tables with the scratch copies. Index and constraint
 * names carry over unchanged, so the schema's IF NOT EXISTS DDL stays
 * idempotent. A long-running read can hold the swap off; rather than queue new
 * readers behind it, give up after a short wait and retry.
 */
async function swapIntoPublic(client: SqlClient): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await withTransaction(client, async (tx) => {
        await tx.query(`SET LOCAL lock_timeout = '5s'`);
        await tx.query(`DROP TABLE ${WEIGHT_TABLES.map((t) => `public.${t}`).join(', ')}`);
        for (const table of WEIGHT_TABLES) {
          await tx.query(`ALTER TABLE ${SCRATCH_SCHEMA}.${table} SET SCHEMA public`);
        }
      });
      return;
    } catch (error) {
      if (attempt >= SWAP_ATTEMPTS || !isLockTimeout(error)) throw error;
      console.warn(`weight swap attempt ${attempt} timed out waiting for a lock; retrying`);
    }
  }
}

function isLockTimeout(error: unknown): boolean {
  return (error as { code?: string }).code === '55P03';
}
