import { Client } from 'pg';
import { extractMusicBrainz } from '../ingest/musicbrainz.js';
import { populateBacklog } from './backlog.js';
import { optionalIntEnv } from './env.js';

/**
 * Refresh the candidate backlog from an extracted MusicBrainz dump. Run by the
 * weekly refresh job after it downloads + extracts the tables.
 *
 * MB_DUMP_DIR          directory of extracted mbdump tables
 * DATABASE_URL         Postgres connection string for the corpus
 * MB_CANDIDATE_LIMIT   optional cap on candidates (dev/staging set ~1000 to keep
 *                      the corpus tiny; prod leaves it unset for the full set)
 */
const dumpDir = process.env.MB_DUMP_DIR;
const databaseUrl = process.env.DATABASE_URL;
if (!dumpDir || !databaseUrl) {
  console.error('MB_DUMP_DIR and DATABASE_URL are required');
  process.exit(1);
}
const candidateLimit = optionalIntEnv('MB_CANDIDATE_LIMIT');

const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
try {
  const client = {
    query: (sql: string, params?: unknown[]) =>
      pg.query(sql, params).then((r) => ({ rows: r.rows })),
  };
  const recordings = await extractMusicBrainz(dumpDir, candidateLimit);
  await populateBacklog(client, recordings);
  console.log(
    JSON.stringify({ candidates: recordings.length, cap: candidateLimit ?? null }, null, 2),
  );
} finally {
  await pg.end();
}
