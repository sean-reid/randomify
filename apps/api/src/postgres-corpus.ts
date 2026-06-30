import {
  PLATFORM_BY_ID,
  type LinkKind,
  type PlatformId,
  type PlatformLink,
  type Song,
} from '@randomify/shared';
import type { CorpusProvider, SpinInput, SpinPick } from './corpus.js';

/** Minimal Postgres client surface, satisfied by postgres.js and PGlite. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * One spin resolved as a single round trip. Each CTE picks one level from the
 * prefix-sum index: scale the draw by the partition total (its max cumulative
 * weight) and take the first row that crosses it. The artist level walks every
 * draw in `$3` and prefers the first whose artist is not excluded ($6), so
 * anti-repeat costs no extra round trips. Each draw stays an indexed point
 * lookup, so a popular facet never triggers a partition scan.
 *
 * If the facet has no values, `cf` is empty and every downstream CTE resolves
 * to nothing, so the query returns zero rows and the caller tries another facet.
 *
 * $1 facet_type  $2 facet draw  $3 artist draws[]  $4 release-group draw
 * $5 recording draw  $6 exclude artist ids[]
 */
const SPIN_SQL = `
WITH
fv_total AS (
  SELECT max(cum_weight) AS m FROM facet_value WHERE facet_type = $1
),
cf AS (
  SELECT facet_id FROM facet_value, fv_total
  WHERE facet_value.facet_type = $1 AND cum_weight >= $2 * fv_total.m
  ORDER BY cum_weight LIMIT 1
),
fa_total AS (
  SELECT max(cum_weight) AS m FROM facet_artist
  WHERE facet_type = $1 AND facet_id = (SELECT facet_id FROM cf)
),
artist_draws AS (
  SELECT d.ord, (
    SELECT fa.artist_id FROM facet_artist fa
    WHERE fa.facet_type = $1 AND fa.facet_id = (SELECT facet_id FROM cf)
      AND fa.cum_weight >= d.r * (SELECT m FROM fa_total)
    ORDER BY fa.cum_weight LIMIT 1
  ) AS artist_id
  FROM unnest($3::double precision[]) WITH ORDINALITY AS d(r, ord)
),
ca AS (
  -- Prefer the first draw landing on a non-excluded artist; if every draw is
  -- excluded, fall back to the first draw so a spin always resolves.
  SELECT artist_id FROM artist_draws
  WHERE artist_id IS NOT NULL
  ORDER BY (artist_id = ANY($6)), ord
  LIMIT 1
),
rg_total AS (
  SELECT max(cum_weight) AS m FROM artist_release_group
  WHERE artist_id = (SELECT artist_id FROM ca)
),
crg AS (
  SELECT release_group_id FROM artist_release_group, rg_total
  WHERE artist_id = (SELECT artist_id FROM ca) AND cum_weight >= $4 * rg_total.m
  ORDER BY cum_weight LIMIT 1
),
rec_total AS (
  SELECT max(cum_index) AS m FROM release_group_recording
  WHERE release_group_id = (SELECT release_group_id FROM crg)
),
crec AS (
  -- Clamp so a draw approaching 1.0 (floor(r*m)+1 = m+1) lands on the last
  -- recording instead of missing every row.
  SELECT recording_id FROM release_group_recording, rec_total
  WHERE release_group_id = (SELECT release_group_id FROM crg)
    AND cum_index = LEAST(floor($5::double precision * rec_total.m)::int + 1, rec_total.m)
)
SELECT r.id, r.title, r.artist_id, a.name AS artist, r.release_group_id,
       rg.title AS release_title, r.year, r.isrc, r.duration_ms,
       r.cover_art_url, r.preview_url, r.genres,
       COALESCE((
         SELECT json_agg(json_build_object('platform', platform, 'url', url, 'kind', kind))
         FROM platform_link WHERE recording_id = r.id
       ), '[]'::json) AS links
FROM crec
JOIN recording r ON r.id = crec.recording_id
JOIN artist a ON a.id = r.artist_id
JOIN release_group rg ON rg.id = r.release_group_id
`;

/**
 * Corpus backed by Postgres (Neon via Hyperdrive in production). A spin is a
 * single query down the tempered prefix-sum index (see SPIN_SQL).
 */
export class PostgresCorpusProvider implements CorpusProvider {
  constructor(private readonly client: SqlClient) {}

  /** Confirm the database answers and the corpus has recordings to serve.
   * EXISTS short-circuits at the first row, so it stays cheap on a large table. */
  async ping(): Promise<void> {
    const { rows } = await this.client.query('SELECT EXISTS (SELECT 1 FROM recording) AS has');
    if (!rows[0] || rows[0].has !== true) throw new Error('corpus is empty');
  }

  async spin(input: SpinInput): Promise<SpinPick | null> {
    const { rows } = await this.client.query(SPIN_SQL, [
      input.facet,
      input.facetDraw,
      input.artistDraws,
      input.releaseGroupDraw,
      input.recordingDraw,
      [...input.exclude],
    ]);
    const row = rows[0];
    if (!row) return null;
    return { song: toSong(row), links: toLinks(row.links) };
  }
}

/** Map a recording row from SPIN_SQL to a Song. */
function toSong(row: Record<string, unknown>): Song {
  return {
    recordingId: String(row.id),
    title: String(row.title),
    artist: String(row.artist),
    artistId: String(row.artist_id),
    releaseTitle: row.release_title == null ? null : String(row.release_title),
    releaseGroupId: String(row.release_group_id),
    year: row.year == null ? null : Number(row.year),
    isrc: row.isrc == null ? null : String(row.isrc),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    coverArtUrl: row.cover_art_url == null ? null : String(row.cover_art_url),
    previewUrl: row.preview_url == null ? null : String(row.preview_url),
    genres: Array.isArray(row.genres) ? row.genres.map(String) : [],
  };
}

/** Parse the json_agg links column (string or already-parsed) into sorted links. */
function toLinks(value: unknown): PlatformLink[] {
  const arr = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(arr)) return [];
  return (arr as Array<{ platform: PlatformId; url: string; kind: LinkKind }>)
    .map((l) => ({ platform: l.platform, url: String(l.url), kind: l.kind }))
    .sort(
      (a, b) => (PLATFORM_ORDER.get(a.platform) ?? 99) - (PLATFORM_ORDER.get(b.platform) ?? 99),
    );
}

// Registry display order, built once (not per request).
const PLATFORM_ORDER = new Map(
  (Object.keys(PLATFORM_BY_ID) as PlatformId[]).map((id, i) => [id, i]),
);
