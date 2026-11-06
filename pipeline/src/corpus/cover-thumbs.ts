import { politeBinaryFetch, rateLimitedFetch, type BinaryFetchLike } from '../resolvers/http.js';
import type { SqlClient } from './export.js';

const MAX_THUMB_BYTES = 4096;
const ABORT_DEFERRED_URLS = 10;
const COVER_PATH = /^\/images\/cover\/[0-9a-f]+\/\d+x\d+-[^/]+\.(?:jpg|png|webp)$/i;

export interface FillCoverThumbsSummary {
  scanned: number;
  filled: number;
  marked: number;
  deferred: number;
  fetches: number;
  aborted: boolean;
}

export interface FillCoverThumbsOptions {
  fetch?: BinaryFetchLike;
  batchSize?: number;
  /** Cap on rows scanned. */
  limit?: number;
  /** Stop after the batch that crosses this budget. */
  maxMs?: number;
  onBatch?: (summary: FillCoverThumbsSummary) => void | Promise<void>;
}

/** The 32x32 WebP variant of a Deezer CDN cover URL, or null for any other URL. */
export function thumbUrlFor(coverArtUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(coverArtUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== 'dzcdn.net' && !url.hostname.endsWith('.dzcdn.net')) return null;
  if (!COVER_PATH.test(url.pathname)) return null;
  url.pathname = url.pathname.replace(/\/\d+x\d+-([^/]+)\.[a-z]+$/i, '/32x32-$1.webp');
  return url.toString();
}

type Outcome = { kind: 'thumb'; value: string } | { kind: 'deferred' };

async function fetchThumb(fetchThumbUrl: BinaryFetchLike, url: string): Promise<Outcome> {
  try {
    const res = await fetchThumbUrl(url);
    const discard = (): Promise<void> => res.discard().catch(() => undefined);
    if (res.status === 429 || res.status >= 500) {
      await discard();
      return { kind: 'deferred' };
    }
    if (!res.ok || !res.contentType?.toLowerCase().startsWith('image/')) {
      await discard();
      return { kind: 'thumb', value: '' };
    }
    const bytes = await res.bytes();
    if (bytes.length === 0 || bytes.length > MAX_THUMB_BYTES) return { kind: 'thumb', value: '' };
    return { kind: 'thumb', value: Buffer.from(bytes).toString('base64') };
  } catch {
    return { kind: 'deferred' };
  }
}

/**
 * Store a base64 32x32 WebP for every recording with a cover URL and no thumb.
 * Each distinct cover URL is fetched once per batch. Rows whose fetch is deferred
 * stay NULL, so the next run picks them up.
 */
export async function fillCoverThumbs(
  client: SqlClient,
  options: FillCoverThumbsOptions = {},
): Promise<FillCoverThumbsSummary> {
  const fetcher = options.fetch ?? rateLimitedFetch(politeBinaryFetch, { minIntervalMs: 100 });
  const batchSize = options.batchSize ?? 500;
  const limit = options.limit ?? Infinity;
  const deadline = options.maxMs == null ? Infinity : Date.now() + options.maxMs;
  const summary: FillCoverThumbsSummary = {
    scanned: 0,
    filled: 0,
    marked: 0,
    deferred: 0,
    fetches: 0,
    aborted: false,
  };

  let cursorUrl = '';
  let cursorId = '';
  while (summary.scanned < limit) {
    const take = Math.min(batchSize, limit - summary.scanned);
    const { rows } = await client.query(
      `SELECT id, cover_art_url FROM recording
       WHERE cover_art_url IS NOT NULL AND cover_thumb IS NULL
         AND (cover_art_url, id) > ($1, $2)
       ORDER BY cover_art_url, id LIMIT $3`,
      [cursorUrl, cursorId, take],
    );
    if (rows.length === 0) break;
    summary.scanned += rows.length;
    const last = rows[rows.length - 1]!;
    cursorUrl = String(last.cover_art_url);
    cursorId = String(last.id);

    const idsByUrl = new Map<string, string[]>();
    for (const row of rows) {
      const url = String(row.cover_art_url);
      const ids = idsByUrl.get(url);
      if (ids) ids.push(String(row.id));
      else idsByUrl.set(url, [String(row.id)]);
    }

    const writeIds: string[] = [];
    const writeThumbs: string[] = [];
    const record = (ids: string[], thumb: string): void => {
      for (const id of ids) {
        writeIds.push(id);
        writeThumbs.push(thumb);
      }
      if (thumb === '') summary.marked += ids.length;
      else summary.filled += ids.length;
    };

    let deferredUrls = 0;
    await Promise.all(
      [...idsByUrl].map(async ([coverUrl, ids]) => {
        const thumbUrl = thumbUrlFor(coverUrl);
        if (thumbUrl == null) return record(ids, '');
        summary.fetches += 1;
        const outcome = await fetchThumb(fetcher, thumbUrl);
        if (outcome.kind === 'thumb') return record(ids, outcome.value);
        deferredUrls += 1;
        summary.deferred += ids.length;
      }),
    );

    if (writeIds.length > 0) {
      await client.query(
        `UPDATE recording r SET cover_thumb = v.thumb
         FROM unnest($1::text[], $2::text[]) AS v(id, thumb)
         WHERE r.id = v.id AND r.cover_thumb IS NULL`,
        [writeIds, writeThumbs],
      );
    }
    await options.onBatch?.({ ...summary });

    if (deferredUrls >= ABORT_DEFERRED_URLS) {
      summary.aborted = true;
      break;
    }
    if (Date.now() >= deadline) break;
  }
  return summary;
}

/** Partial index that shrinks as the fill completes. CONCURRENTLY cannot run in a transaction. */
export async function ensureCoverThumbIndex(client: SqlClient): Promise<void> {
  const { rows } = await client.query(
    `SELECT i.indisvalid FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
     WHERE c.relname = 'recording_cover_thumb_todo' AND c.relnamespace = current_schema()::regnamespace`,
  );
  if (rows.length > 0 && rows[0]!.indisvalid === false) {
    await client.query('DROP INDEX CONCURRENTLY recording_cover_thumb_todo');
  }
  await client.query(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS recording_cover_thumb_todo
     ON recording (cover_art_url, id) WHERE cover_thumb IS NULL AND cover_art_url IS NOT NULL`,
  );
}
