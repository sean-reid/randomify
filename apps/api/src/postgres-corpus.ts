import {
  PLATFORM_BY_ID,
  type Facet,
  type LinkKind,
  type PlatformId,
  type PlatformLink,
  type Song,
} from '@randomify/shared';
import type { CorpusProvider } from './corpus.js';

/** Minimal Postgres client surface, satisfied by postgres.js and PGlite. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Corpus backed by Postgres (Neon via Hyperdrive in production). Each level of
 * the walk is one indexed prefix-sum query: scale the uniform draw by the
 * partition total and take the first row whose cumulative weight crosses it.
 */
export class PostgresCorpusProvider implements CorpusProvider {
  constructor(private readonly client: SqlClient) {}

  /** Confirm the database answers and the corpus has recordings to serve.
   * EXISTS short-circuits at the first row, so it stays cheap on a large table. */
  async ping(): Promise<void> {
    const { rows } = await this.client.query('SELECT EXISTS (SELECT 1 FROM recording) AS has');
    if (!rows[0] || rows[0].has !== true) throw new Error('corpus is empty');
  }

  private async one<T>(sql: string, params: unknown[], column: string): Promise<T | null> {
    const { rows } = await this.client.query(sql, params);
    const row = rows[0];
    return row ? (row[column] as T) : null;
  }

  pickFacetValue(facet: Facet, r: number): Promise<string | null> {
    return this.one(
      `WITH t AS (SELECT max(cum_weight) AS m FROM facet_value WHERE facet_type = $1)
       SELECT facet_id FROM facet_value, t
       WHERE facet_type = $1 AND cum_weight >= $2 * t.m
       ORDER BY cum_weight LIMIT 1`,
      [facet, r],
      'facet_id',
    );
  }

  pickArtist(facet: Facet, facetValue: string, r: number): Promise<string | null> {
    return this.one(
      `WITH t AS (
         SELECT max(cum_weight) AS m FROM facet_artist WHERE facet_type = $1 AND facet_id = $2
       )
       SELECT artist_id FROM facet_artist, t
       WHERE facet_type = $1 AND facet_id = $2 AND cum_weight >= $3 * t.m
       ORDER BY cum_weight LIMIT 1`,
      [facet, facetValue, r],
      'artist_id',
    );
  }

  pickReleaseGroup(artistId: string, r: number): Promise<string | null> {
    return this.one(
      `WITH t AS (SELECT max(cum_weight) AS m FROM artist_release_group WHERE artist_id = $1)
       SELECT release_group_id FROM artist_release_group, t
       WHERE artist_id = $1 AND cum_weight >= $2 * t.m
       ORDER BY cum_weight LIMIT 1`,
      [artistId, r],
      'release_group_id',
    );
  }

  pickRecording(releaseGroupId: string, r: number): Promise<string | null> {
    return this.one(
      // Clamp to the partition size so r approaching 1.0 (floor(r*m)+1 = m+1)
      // still lands on the last recording instead of missing every row.
      `WITH t AS (SELECT max(cum_index) AS m FROM release_group_recording WHERE release_group_id = $1)
       SELECT recording_id FROM release_group_recording, t
       WHERE release_group_id = $1
         AND cum_index = LEAST(floor($2::double precision * t.m)::int + 1, t.m)`,
      [releaseGroupId, r],
      'recording_id',
    );
  }

  async loadSong(recordingId: string): Promise<Song> {
    const { rows } = await this.client.query(
      `SELECT r.id, r.title, r.artist_id, a.name AS artist, r.release_group_id,
              rg.title AS release_title, r.year, r.isrc, r.duration_ms,
              r.cover_art_url, r.preview_url, r.genres
       FROM recording r
       JOIN artist a ON a.id = r.artist_id
       JOIN release_group rg ON rg.id = r.release_group_id
       WHERE r.id = $1`,
      [recordingId],
    );
    const row = rows[0];
    if (!row) throw new Error(`unknown recording: ${recordingId}`);
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

  async links(recordingId: string): Promise<PlatformLink[]> {
    const { rows } = await this.client.query(
      `SELECT platform, url, kind FROM platform_link WHERE recording_id = $1`,
      [recordingId],
    );
    return rows
      .map((row) => ({
        platform: row.platform as PlatformId,
        url: String(row.url),
        kind: row.kind as LinkKind,
      }))
      .sort(
        (a, b) => (PLATFORM_ORDER.get(a.platform) ?? 99) - (PLATFORM_ORDER.get(b.platform) ?? 99),
      );
  }
}

// Registry display order, built once (not per request).
const PLATFORM_ORDER = new Map(
  (Object.keys(PLATFORM_BY_ID) as PlatformId[]).map((id, i) => [id, i]),
);
