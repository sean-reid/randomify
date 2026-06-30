import type { NormalizedRecording } from '../ingest/ingest.js';
import { bulkUpsert, toPgArray } from '../corpus/bulk.js';
import type { SqlClient } from '../corpus/export.js';
import { prioritize } from './prioritize.js';

/**
 * The candidate set for resolution, persisted in Postgres so the frequent
 * resolve job can pull a chunk without re-extracting the dump. `refresh-dump`
 * populates it; `resolve` reads unresolved rows and marks them done. The
 * `resolved_at` marker makes the resolve job idempotent and resumable.
 */
export const BACKLOG_SCHEMA = `
CREATE TABLE IF NOT EXISTS recording_backlog (
  recording_id      TEXT PRIMARY KEY,
  artist_id         TEXT NOT NULL,
  artist            TEXT NOT NULL,
  release_group_id  TEXT NOT NULL,
  release_title     TEXT,
  title             TEXT NOT NULL,
  isrc              TEXT,
  duration_ms       INTEGER,
  year              INTEGER,
  country           TEXT,
  language          TEXT,
  genres            TEXT[] NOT NULL DEFAULT '{}',
  streaming_links   TEXT,
  priority          INTEGER NOT NULL,
  resolved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recording_backlog_unresolved
  ON recording_backlog (priority) WHERE resolved_at IS NULL;
ALTER TABLE recording_backlog ADD COLUMN IF NOT EXISTS streaming_links TEXT;
`;

export async function applyBacklogSchema(client: SqlClient): Promise<void> {
  for (const stmt of BACKLOG_SCHEMA.split(';')
    .map((s) => s.trim())
    .filter(Boolean)) {
    await client.query(stmt);
  }
}

/**
 * Upsert candidates into the backlog. Existing rows keep their `resolved_at`
 * (so already-resolved recordings are not re-queued); metadata and priority are
 * refreshed. Priority is the position from the shared prioritizer.
 */
export async function populateBacklog(
  client: SqlClient,
  recordings: readonly NormalizedRecording[],
): Promise<void> {
  await applyBacklogSchema(client);
  const ordered = prioritize(recordings);

  // Priority is the global position in the prioritized list, baked into each
  // row before the bulk write chunks internally. resolved_at is intentionally
  // omitted, so an existing row keeps its marker and is not re-queued.
  await bulkUpsert(
    client,
    'recording_backlog',
    [
      { name: 'recording_id', type: 'text' },
      { name: 'artist_id', type: 'text' },
      { name: 'artist', type: 'text' },
      { name: 'release_group_id', type: 'text' },
      { name: 'release_title', type: 'text' },
      { name: 'title', type: 'text' },
      { name: 'isrc', type: 'text' },
      { name: 'duration_ms', type: 'int' },
      { name: 'year', type: 'int' },
      { name: 'country', type: 'text' },
      { name: 'language', type: 'text' },
      { name: 'genres', type: 'text', cast: 'text[]' },
      { name: 'streaming_links', type: 'text' },
      { name: 'priority', type: 'int' },
    ],
    ordered.map((r, i) => [
      r.recordingId,
      r.artistId,
      r.artist,
      r.releaseGroupId,
      r.releaseTitle,
      r.title,
      r.isrc,
      r.durationMs,
      r.year,
      r.country,
      r.language,
      toPgArray(r.genres),
      JSON.stringify(r.streamingLinks ?? {}),
      i,
    ]),
    'recording_id',
  );
}

/** Pull the next unresolved chunk, highest priority first. */
export async function selectUnresolved(
  client: SqlClient,
  limit: number,
): Promise<NormalizedRecording[]> {
  const { rows } = await client.query(
    `SELECT recording_id, artist_id, artist, release_group_id, release_title, title,
            isrc, duration_ms, year, country, language, genres, streaming_links
     FROM recording_backlog WHERE resolved_at IS NULL ORDER BY priority LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    recordingId: String(row.recording_id),
    title: String(row.title),
    artistId: String(row.artist_id),
    artist: String(row.artist),
    releaseGroupId: String(row.release_group_id),
    releaseTitle: String(row.release_title ?? ''),
    year: row.year == null ? null : Number(row.year),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    isrc: row.isrc == null ? null : String(row.isrc),
    country: row.country == null ? null : String(row.country),
    language: row.language == null ? null : String(row.language),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
    streamingLinks: parseStreamingLinks(row.streaming_links, String(row.recording_id)),
  }));
}

/** Parse the stored streaming-links JSON, tolerating a corrupt value. */
function parseStreamingLinks(value: unknown, recordingId: string): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    console.error(`backlog: bad streaming_links JSON for ${recordingId}`);
    return {};
  }
}

/** Mark recordings resolved so they are not pulled again. */
export async function markResolved(client: SqlClient, recordingIds: string[]): Promise<void> {
  if (recordingIds.length === 0) return;
  await client.query(
    `UPDATE recording_backlog SET resolved_at = now() WHERE recording_id = ANY($1)`,
    [recordingIds],
  );
}
