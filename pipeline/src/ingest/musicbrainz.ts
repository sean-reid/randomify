import { DuckDBInstance } from '@duckdb/node-api';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NormalizedRecording } from './ingest.js';

/**
 * Extract normalized recordings from a MusicBrainz core dump (the `mbdump`
 * tables, extracted to `dumpDir`). Filtered to recordings that carry an ISRC,
 * which is the natural streamable-candidate set and far smaller than the full
 * ~30M recordings.
 *
 * The dump files are header-less TSVs (PostgreSQL COPY output, `\\N` for NULL),
 * so columns are referenced by position. The indices below follow the
 * documented MusicBrainz schema; verify against a real dump on the first run.
 *
 * Year (release_group_meta) and genres (genre/tag tables) live in the DERIVED
 * dump. When those tables are present they are joined in; when absent (core-only
 * dump) year is null and genres are empty, and the sampler tolerates that.
 */
// alias -> selected columns, referenced by stable ordinal names c0, c1, ...
// (assigned below regardless of the file's total column count). The indices
// follow the documented MusicBrainz schema; verify against a real dump.
const TABLES: Record<string, string> = {
  rec: 'c0::BIGINT AS id, c1 AS gid, c2 AS name, c3::BIGINT AS artist_credit, TRY_CAST(c4 AS BIGINT) AS length',
  isrc: 'c1::BIGINT AS recording, c2 AS isrc',
  acn: 'c0::BIGINT AS artist_credit, TRY_CAST(c1 AS INT) AS position, c2::BIGINT AS artist',
  artist: 'c0::BIGINT AS id, c1 AS gid, c2 AS name, TRY_CAST(c11 AS BIGINT) AS area',
  track: 'c2::BIGINT AS recording, c3::BIGINT AS medium',
  medium: 'c0::BIGINT AS id, c1::BIGINT AS release',
  release: 'c0::BIGINT AS id, c4::BIGINT AS release_group, TRY_CAST(c7 AS BIGINT) AS language',
  release_group: 'c0::BIGINT AS id, c1 AS gid, c2 AS name',
  release_group_meta: 'c0::BIGINT AS id, TRY_CAST(c2 AS INT) AS first_year',
  area: 'c0::BIGINT AS id, c2 AS name',
  language: 'c0::BIGINT AS id, c6 AS iso3',
  // Genre tables (derived dump): genre is the canonical genre list, tag maps
  // ids to names, rgt links release groups to tags with a vote count.
  genre: 'c2 AS name',
  tag: 'c0::BIGINT AS id, c1 AS name',
  rgt: 'c0::BIGINT AS rg, c1::BIGINT AS tag, TRY_CAST(c2 AS INT) AS count',
};

// Tables absent from a core-only dump (they live in the derived dump). Missing
// optional tables become empty, yielding null years and no genres.
const OPTIONAL = new Set(['release_group_meta', 'genre', 'tag', 'rgt']);

/** Dump file name for each alias (mbdump table names). */
const FILES: Record<string, string> = {
  rec: 'recording',
  isrc: 'isrc',
  acn: 'artist_credit_name',
  artist: 'artist',
  track: 'track',
  medium: 'medium',
  release: 'release',
  release_group: 'release_group',
  release_group_meta: 'release_group_meta',
  area: 'area',
  language: 'language',
  genre: 'genre',
  tag: 'tag',
  rgt: 'release_group_tag',
};

const EXTRACT_SQL = `
WITH isrc1 AS (
  SELECT recording, min(isrc) AS isrc FROM isrc GROUP BY recording
),
primary_artist AS (
  SELECT artist_credit, min(artist) FILTER (WHERE position = 0) AS artist
  FROM acn GROUP BY artist_credit
),
rec_rg AS (
  SELECT t.recording AS recording, r.release_group AS rg, r.language AS lang,
         COALESCE(rgm.first_year, 99999) AS yr
  FROM track t
  JOIN medium m ON m.id = t.medium
  JOIN release r ON r.id = m.release
  LEFT JOIN release_group_meta rgm ON rgm.id = r.release_group
),
chosen AS (
  SELECT recording, rg, lang, NULLIF(yr, 99999) AS yr FROM (
    SELECT recording, rg, lang, yr,
           row_number() OVER (PARTITION BY recording ORDER BY yr, rg) AS rn
    FROM rec_rg
  ) WHERE rn = 1
),
rg_genre AS (
  -- Top genres per release group: tags whose name is a known genre, most-voted
  -- first, joined with chr(1) so the JS side can split them back into an array.
  SELECT rg, string_agg(name, chr(1) ORDER BY cnt DESC, name) AS genres FROM (
    SELECT rgt.rg AS rg, t.name AS name, rgt.count AS cnt,
           row_number() OVER (PARTITION BY rgt.rg ORDER BY rgt.count DESC, t.name) AS rn
    FROM rgt
    JOIN tag t ON t.id = rgt.tag
    JOIN genre g ON lower(g.name) = lower(t.name)
    WHERE COALESCE(rgt.count, 0) > 0
  ) WHERE rn <= 3
  GROUP BY rg
)
SELECT
  rec.gid AS recordingId,
  rec.name AS title,
  art.gid AS artistId,
  art.name AS artist,
  rg.gid AS releaseGroupId,
  rg.name AS releaseTitle,
  chosen.yr AS year,
  rec.length AS durationMs,
  isrc1.isrc AS isrc,
  ar.name AS country,
  lng.iso3 AS language,
  rgg.genres AS genres
FROM rec
JOIN isrc1 ON isrc1.recording = rec.id
JOIN primary_artist pa ON pa.artist_credit = rec.artist_credit
JOIN artist art ON art.id = pa.artist
LEFT JOIN area ar ON ar.id = art.area
JOIN chosen ON chosen.recording = rec.id
JOIN release_group rg ON rg.id = chosen.rg
LEFT JOIN language lng ON lng.id = chosen.lang
LEFT JOIN rg_genre rgg ON rgg.rg = chosen.rg
ORDER BY rec.gid
`;

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'bigint' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

export async function extractMusicBrainz(
  dumpDir: string,
  limit?: number,
): Promise<NormalizedRecording[]> {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  for (const [alias, columns] of Object.entries(TABLES)) {
    const filePath = join(dumpDir, FILES[alias]!);

    if (!existsSync(filePath)) {
      if (!OPTIONAL.has(alias)) throw new Error(`missing required dump table: ${FILES[alias]}`);
      // Create an empty table with the projected columns so joins still work.
      const maxIdx = Math.max(0, ...[...columns.matchAll(/c(\d+)/g)].map((m) => Number(m[1])));
      const stub = Array.from({ length: maxIdx + 1 }, (_, i) => `NULL::VARCHAR AS c${i}`).join(
        ', ',
      );
      await connection.run(
        `CREATE TABLE ${alias} AS SELECT ${columns} FROM (SELECT ${stub}) WHERE false`,
      );
      continue;
    }

    const path = filePath.replace(/'/g, "''");
    const read = `read_csv('${path}', delim='\t', header=false, quote='', nullstr='\\N', all_varchar=true`;

    // Detect the column count so columns get stable names (c0, c1, ...)
    // regardless of how many columns the table has (which differs between the
    // test fixture and the real dump, and would otherwise change DuckDB's
    // auto-generated names).
    const probe = await connection.run(`SELECT * FROM ${read}) LIMIT 1`);
    const probeRows = await probe.getRowObjects();
    const count = probeRows[0] ? Object.keys(probeRows[0]).length : 0;
    const names = Array.from({ length: count }, (_, i) => `'c${i}'`).join(', ');

    await connection.run(
      `CREATE TABLE ${alias} AS SELECT ${columns} FROM ${read}, names=[${names}])`,
    );
  }

  const sql =
    limit && Number.isInteger(limit) && limit > 0 ? `${EXTRACT_SQL} LIMIT ${limit}` : EXTRACT_SQL;
  const result = await connection.run(sql);
  const rows = await result.getRowObjects();
  return rows.map((row) => ({
    recordingId: String(row.recordingId),
    title: String(row.title),
    artistId: String(row.artistId),
    artist: String(row.artist),
    releaseGroupId: String(row.releaseGroupId),
    releaseTitle: String(row.releaseTitle),
    year: num(row.year),
    durationMs: num(row.durationMs),
    isrc: str(row.isrc),
    country: str(row.country),
    language: str(row.language),
    genres: row.genres ? String(row.genres).split('\u0001') : [],
  }));
}
