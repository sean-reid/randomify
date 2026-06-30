import type { LinkKind, PlatformId } from '@randomify/shared';
import { bulkUpsert, toPgArray, type BulkColumn } from './bulk.js';
import { CORPUS_TABLES, SCHEMA_SQL } from './schema.js';
import type { CorpusWeights } from './weights.js';

/** Minimal Postgres client surface, satisfied by node-postgres and PGlite. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /**
   * Optionally run `fn` inside a transaction pinned to a single connection. A
   * pooled client MUST implement this so BEGIN/COMMIT do not scatter across
   * connections; a single-connection client (one node-postgres Client, PGlite)
   * may omit it and `withTransaction` falls back to issuing BEGIN/COMMIT inline.
   */
  transaction?<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

/**
 * Run `fn` as a transaction. With a pooled client this pins one connection (so
 * the whole BEGIN..COMMIT runs on it); otherwise it brackets `fn` with inline
 * BEGIN/COMMIT and rolls back on error. The serving corpus stays consistent for
 * readers either way: they see the previous contents until COMMIT.
 */
export async function withTransaction<T>(
  client: SqlClient,
  fn: (tx: SqlClient) => Promise<T>,
): Promise<T> {
  if (client.transaction) return client.transaction(fn);
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export interface CorpusArtist {
  id: string;
  name: string;
  country: string | null;
}
export interface CorpusReleaseGroup {
  id: string;
  artistId: string;
  title: string;
  year: number | null;
}
export interface CorpusRecording {
  id: string;
  artistId: string;
  releaseGroupId: string;
  title: string;
  isrc: string | null;
  durationMs: number | null;
  year: number | null;
  language: string | null;
  coverArtUrl: string | null;
  previewUrl: string | null;
  genres: string[];
}
export interface CorpusLink {
  recordingId: string;
  platform: PlatformId;
  url: string;
  kind: LinkKind;
  confidence: number;
}

export interface CorpusData {
  artists: CorpusArtist[];
  releaseGroups: CorpusReleaseGroup[];
  recordings: CorpusRecording[];
  links: CorpusLink[];
  weights: CorpusWeights;
}

/**
 * Add columns introduced after a table's first creation, so an existing
 * database is brought up to date in place (CREATE TABLE IF NOT EXISTS never
 * alters an existing table). Keep these idempotent.
 */
const SCHEMA_MIGRATIONS = [
  'ALTER TABLE recording ADD COLUMN IF NOT EXISTS cover_art_url TEXT',
  'ALTER TABLE recording ADD COLUMN IF NOT EXISTS preview_url TEXT',
];

/** Create the corpus tables if they do not exist, then apply column migrations.
 * Runs each statement separately so it works on clients that reject
 * multi-statement queries. */
export async function applySchema(client: SqlClient): Promise<void> {
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await client.query(statement);
  for (const migration of SCHEMA_MIGRATIONS) await client.query(migration);
}

/** Bulk INSERT into a freshly-truncated table via array-bound `unnest`. */
function insertRows(
  client: SqlClient,
  table: string,
  columns: BulkColumn[],
  rows: readonly unknown[][],
): Promise<void> {
  return bulkUpsert(client, table, columns, rows);
}

/**
 * Rebuild the serving corpus in a single transaction: truncate every table and
 * reload it. Other readers keep seeing the previous corpus until commit (MVCC),
 * so the swap is atomic and never exposes a half-built state.
 */
export async function exportCorpus(client: SqlClient, data: CorpusData): Promise<void> {
  await applySchema(client);
  await withTransaction(client, async (tx) => {
    await tx.query(`TRUNCATE ${CORPUS_TABLES.join(', ')}`);

    await insertRows(
      tx,
      'artist',
      [
        { name: 'id', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'country', type: 'text' },
      ],
      data.artists.map((a) => [a.id, a.name, a.country]),
    );
    await insertRows(
      tx,
      'release_group',
      [
        { name: 'id', type: 'text' },
        { name: 'artist_id', type: 'text' },
        { name: 'title', type: 'text' },
        { name: 'year', type: 'int' },
      ],
      data.releaseGroups.map((rg) => [rg.id, rg.artistId, rg.title, rg.year]),
    );
    await insertRows(
      tx,
      'recording',
      [
        { name: 'id', type: 'text' },
        { name: 'artist_id', type: 'text' },
        { name: 'release_group_id', type: 'text' },
        { name: 'title', type: 'text' },
        { name: 'isrc', type: 'text' },
        { name: 'duration_ms', type: 'int' },
        { name: 'year', type: 'int' },
        { name: 'language', type: 'text' },
        { name: 'cover_art_url', type: 'text' },
        { name: 'preview_url', type: 'text' },
        { name: 'genres', type: 'text', cast: 'text[]' },
      ],
      data.recordings.map((r) => [
        r.id,
        r.artistId,
        r.releaseGroupId,
        r.title,
        r.isrc,
        r.durationMs,
        r.year,
        r.language,
        r.coverArtUrl,
        r.previewUrl,
        toPgArray(r.genres),
      ]),
    );
    await insertRows(
      tx,
      'platform_link',
      [
        { name: 'recording_id', type: 'text' },
        { name: 'platform', type: 'text' },
        { name: 'url', type: 'text' },
        { name: 'kind', type: 'text' },
        { name: 'confidence', type: 'double precision' },
      ],
      data.links.map((l) => [l.recordingId, l.platform, l.url, l.kind, l.confidence]),
    );
    await insertWeights(tx, data.weights);
  });
}

/** Insert the four tempered prefix-sum weight index tables. */
export async function insertWeights(client: SqlClient, weights: CorpusWeights): Promise<void> {
  await insertRows(
    client,
    'facet_value',
    [
      { name: 'facet_type', type: 'text' },
      { name: 'facet_id', type: 'text' },
      { name: 'weight', type: 'double precision' },
      { name: 'cum_weight', type: 'double precision' },
    ],
    weights.facetValues.map((f) => [f.facetType, f.facetId, f.weight, f.cumWeight]),
  );
  await insertRows(
    client,
    'facet_artist',
    [
      { name: 'facet_type', type: 'text' },
      { name: 'facet_id', type: 'text' },
      { name: 'artist_id', type: 'text' },
      { name: 'weight', type: 'double precision' },
      { name: 'cum_weight', type: 'double precision' },
    ],
    weights.facetArtists.map((f) => [f.facetType, f.facetId, f.artistId, f.weight, f.cumWeight]),
  );
  await insertRows(
    client,
    'artist_release_group',
    [
      { name: 'artist_id', type: 'text' },
      { name: 'release_group_id', type: 'text' },
      { name: 'weight', type: 'double precision' },
      { name: 'cum_weight', type: 'double precision' },
    ],
    weights.artistReleaseGroups.map((a) => [a.artistId, a.releaseGroupId, a.weight, a.cumWeight]),
  );
  await insertRows(
    client,
    'release_group_recording',
    [
      { name: 'release_group_id', type: 'text' },
      { name: 'recording_id', type: 'text' },
      { name: 'cum_index', type: 'int' },
    ],
    weights.releaseGroupRecordings.map((r) => [r.releaseGroupId, r.recordingId, r.cumIndex]),
  );
}
