import { DuckDBInstance } from '@duckdb/node-api';
import { join } from 'node:path';

/** A recording after normalization, ready for link resolution and weighting. */
export interface NormalizedRecording {
  recordingId: string;
  title: string;
  artistId: string;
  artist: string;
  releaseGroupId: string;
  releaseTitle: string;
  year: number | null;
  durationMs: number | null;
  isrc: string | null;
  country: string | null;
  language: string | null;
  genres: string[];
}

/**
 * The extracted MusicBrainz tables this stage expects, one TSV each. Mapping the
 * raw MusicBrainz dump into these is a separate extraction step (run against the
 * dumps in R2); driving the ingest off a small fixture keeps it testable in CI.
 */
const SOURCE_TABLES = ['artist', 'release_group', 'recording', 'isrc', 'recording_genre'] as const;

function toNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'bigint' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

/** DuckDB returns LIST columns as { items }, not a plain array. */
function toStringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  const items = (value as { items?: unknown[] }).items;
  return Array.isArray(items) ? items.map(String) : [];
}

/**
 * Read the extracted MusicBrainz TSVs from `dir` and join them into normalized
 * recordings: the artist -> release-group -> recording hierarchy with ISRC,
 * genres, year, country, and language attached.
 */
export async function ingest(dir: string): Promise<NormalizedRecording[]> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  for (const table of SOURCE_TABLES) {
    const path = join(dir, `${table}.tsv`).replace(/'/g, "''");
    await connection.run(
      `CREATE TABLE ${table} AS SELECT * FROM read_csv('${path}', delim='\t', header=true, all_varchar=true)`,
    );
  }

  const result = await connection.run(`
    SELECT
      r.gid AS recordingId,
      r.name AS title,
      a.gid AS artistId,
      a.name AS artist,
      rg.gid AS releaseGroupId,
      rg.name AS releaseTitle,
      TRY_CAST(rg.first_release_year AS INTEGER) AS year,
      TRY_CAST(r.length_ms AS INTEGER) AS durationMs,
      (SELECT min(i.isrc) FROM isrc i WHERE i.recording_id = r.id) AS isrc,
      a.country AS country,
      r.language AS language,
      COALESCE(
        list(DISTINCT g.genre) FILTER (WHERE g.genre IS NOT NULL),
        []
      ) AS genres
    FROM recording r
    JOIN artist a ON a.id = r.artist_id
    JOIN release_group rg ON rg.id = r.release_group_id
    LEFT JOIN recording_genre g ON g.recording_id = r.id
    GROUP BY r.id, r.gid, r.name, a.gid, a.name, rg.gid, rg.name,
             rg.first_release_year, r.length_ms, a.country, r.language
    ORDER BY r.gid
  `);

  const rows = await result.getRowObjects();
  return rows.map((row) => ({
    recordingId: String(row.recordingId),
    title: String(row.title),
    artistId: String(row.artistId),
    artist: String(row.artist),
    releaseGroupId: String(row.releaseGroupId),
    releaseTitle: String(row.releaseTitle),
    year: toNullableNumber(row.year),
    durationMs: toNullableNumber(row.durationMs),
    isrc: toNullableString(row.isrc),
    country: toNullableString(row.country),
    language: toNullableString(row.language),
    genres: toStringList(row.genres),
  }));
}
