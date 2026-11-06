import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import type { BinaryFetchLike, BinaryResponse } from '../resolvers/http.js';
import { ensureCoverThumbIndex, fillCoverThumbs, thumbUrlFor } from './cover-thumbs.js';
import { buildWeights } from './weights.js';
import { exportCorpus, type CorpusData, type CorpusRecording } from './export.js';

const MD5 = 'a'.repeat(32);
const cover = (n: number | string): string =>
  `https://cdn-images.dzcdn.net/images/cover/${String(n).padStart(32, 'b')}/1000x1000-000000-80-0-0.jpg`;
const thumb = (n: number | string): string =>
  `https://cdn-images.dzcdn.net/images/cover/${String(n).padStart(32, 'b')}/32x32-000000-80-0-0.webp`;

function recording(id: string, coverArtUrl: string | null): CorpusRecording {
  return {
    id,
    artistId: 'a1',
    releaseGroupId: 'rg1',
    title: id,
    isrc: null,
    durationMs: null,
    year: 1995,
    language: 'eng',
    coverArtUrl,
    previewUrl: null,
    genres: [],
  };
}

async function corpus(recordings: CorpusRecording[]): Promise<PGlite> {
  const db = new PGlite();
  const data: CorpusData = {
    artists: [{ id: 'a1', name: 'Artist', country: 'GB' }],
    releaseGroups: [{ id: 'rg1', artistId: 'a1', title: 'RG', year: 1995 }],
    recordings,
    links: [],
    weights: buildWeights([]),
    sampleRecordings: [],
    facetCatalog: [],
  };
  await exportCorpus(db, data);
  return db;
}

const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
const B64 = Buffer.from(BYTES).toString('base64');

function res(status: number, contentType: string | null, bytes = BYTES): BinaryResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    contentType,
    bytes: () => Promise.resolve(bytes),
  };
}

function fake(respond: (url: string) => BinaryResponse | Promise<BinaryResponse>) {
  const urls: string[] = [];
  const fetch: BinaryFetchLike = async (url) => {
    urls.push(url);
    return respond(url);
  };
  return { fetch, urls };
}

async function thumbs(db: PGlite): Promise<Record<string, string | null>> {
  const r = await db.query<{ id: string; cover_thumb: string | null }>(
    'SELECT id, cover_thumb FROM recording ORDER BY id',
  );
  return Object.fromEntries(r.rows.map((x) => [x.id, x.cover_thumb]));
}

describe('thumbUrlFor', () => {
  it('maps a cover URL to the 32x32 webp variant', () => {
    expect(thumbUrlFor(cover(1))).toBe(thumb(1));
    expect(
      thumbUrlFor(`https://e-cdns-images.dzcdn.net/images/cover/${MD5}/500x500-000000-80-0-0.png`),
    ).toBe(`https://e-cdns-images.dzcdn.net/images/cover/${MD5}/32x32-000000-80-0-0.webp`);
  });

  it('rejects other hosts, schemes and paths', () => {
    expect(thumbUrlFor(cover(1).replace('https', 'http'))).toBeNull();
    expect(thumbUrlFor(cover(1).replace('dzcdn.net', 'example.com'))).toBeNull();
    expect(thumbUrlFor(cover(1).replace('dzcdn.net', 'evildzcdn.net'))).toBeNull();
    expect(
      thumbUrlFor(`https://cdn-images.dzcdn.net/images/artist/${MD5}/1000x1000-000000-80-0-0.jpg`),
    ).toBeNull();
    expect(thumbUrlFor(`https://cdn-images.dzcdn.net/images/cover/${MD5}/cover.jpg`)).toBeNull();
    expect(thumbUrlFor(`https://cdn-images.dzcdn.net/images/cover/zzz/1000x1000-0.jpg`)).toBeNull();
    expect(thumbUrlFor('not a url')).toBeNull();
  });
});

describe('fillCoverThumbs', () => {
  it('stores base64 and fetches each distinct URL once', async () => {
    const db = await corpus([
      recording('r1', cover(1)),
      recording('r2', cover(1)),
      recording('r3', cover(2)),
      recording('r4', null),
    ]);
    const { fetch, urls } = fake(() => res(200, 'image/webp'));
    const summary = await fillCoverThumbs(db, { fetch, batchSize: 10 });
    expect(summary).toEqual({
      scanned: 3,
      filled: 3,
      marked: 0,
      deferred: 0,
      fetches: 2,
      aborted: false,
    });
    expect([...urls].sort()).toEqual([thumb(1), thumb(2)]);
    expect(await thumbs(db)).toEqual({ r1: B64, r2: B64, r3: B64, r4: null });
  });

  it('marks empty on a 404, a non-image type, an oversize body and an unmappable URL', async () => {
    const db = await corpus([
      recording('r1', cover(1)),
      recording('r2', cover(2)),
      recording('r3', cover(3)),
      recording('r4', 'https://example.com/x.jpg'),
      recording('r5', cover(4)),
    ]);
    const { fetch, urls } = fake((url) => {
      if (url === thumb(1)) return res(404, 'text/html');
      if (url === thumb(2)) return res(200, 'text/html');
      if (url === thumb(3)) return res(200, 'image/webp', new Uint8Array(4097));
      return res(200, 'image/webp');
    });
    const summary = await fillCoverThumbs(db, { fetch });
    expect(summary).toMatchObject({ filled: 1, marked: 4, deferred: 0, fetches: 4 });
    expect(urls).not.toContain('https://example.com/x.jpg');
    expect(await thumbs(db)).toEqual({ r1: '', r2: '', r3: '', r4: '', r5: B64 });
  });

  it('leaves NULL and reports deferred on a thrown fetch, 429 or 5xx', async () => {
    const db = await corpus([
      recording('r1', cover(1)),
      recording('r2', cover(2)),
      recording('r3', cover(3)),
      recording('r4', cover(4)),
    ]);
    const { fetch } = fake((url) => {
      if (url === thumb(1)) throw new Error('socket hang up');
      if (url === thumb(2)) return res(429, null);
      if (url === thumb(3)) return res(503, null);
      return res(200, 'image/webp');
    });
    const summary = await fillCoverThumbs(db, { fetch });
    expect(summary).toMatchObject({ filled: 1, deferred: 3, aborted: false });
    expect(await thumbs(db)).toEqual({ r1: null, r2: null, r3: null, r4: B64 });

    const retry = fake(() => res(200, 'image/webp'));
    const second = await fillCoverThumbs(db, { fetch: retry.fetch });
    expect(second).toMatchObject({ scanned: 3, filled: 3 });
    expect(retry.urls).toHaveLength(3);
  });

  it('aborts at ten deferred URLs after writing what succeeded', async () => {
    const recs = Array.from({ length: 12 }, (_, i) =>
      recording(`r${String(i).padStart(2, '0')}`, cover(i)),
    );
    const db = await corpus(recs);
    const { fetch } = fake((url) => (url === thumb(0) ? res(200, 'image/webp') : res(429, null)));
    const summary = await fillCoverThumbs(db, { fetch, batchSize: 12 });
    expect(summary).toMatchObject({ filled: 1, deferred: 11, aborted: true });
    const stored = await thumbs(db);
    expect(stored.r00).toBe(B64);
    expect(Object.values(stored).filter((v) => v === null)).toHaveLength(11);
  });

  it('does not abort below the threshold', async () => {
    const recs = Array.from({ length: 9 }, (_, i) => recording(`r${i}`, cover(i)));
    const db = await corpus(recs);
    const summary = await fillCoverThumbs(db, { fetch: fake(() => res(503, null)).fetch });
    expect(summary).toMatchObject({ deferred: 9, aborted: false });
  });

  it('honours limit across batches', async () => {
    const recs = Array.from({ length: 6 }, (_, i) => recording(`r${i}`, cover(i)));
    const db = await corpus(recs);
    const { fetch } = fake(() => res(200, 'image/webp'));
    const summary = await fillCoverThumbs(db, { fetch, batchSize: 2, limit: 3 });
    expect(summary).toMatchObject({ scanned: 3, filled: 3 });
    expect(Object.values(await thumbs(db)).filter((v) => v === null)).toHaveLength(3);
  });

  it('stops after the batch that crosses maxMs', async () => {
    const recs = Array.from({ length: 6 }, (_, i) => recording(`r${i}`, cover(i)));
    const db = await corpus(recs);
    const { fetch } = fake(() => res(200, 'image/webp'));
    const summary = await fillCoverThumbs(db, { fetch, batchSize: 2, maxMs: 0 });
    expect(summary.scanned).toBe(2);
  });

  it('reports each batch through onBatch', async () => {
    const recs = Array.from({ length: 4 }, (_, i) => recording(`r${i}`, cover(i)));
    const db = await corpus(recs);
    const seen: number[] = [];
    await fillCoverThumbs(db, {
      fetch: fake(() => res(200, 'image/webp')).fetch,
      batchSize: 2,
      onBatch: (s) => void seen.push(s.scanned),
    });
    expect(seen).toEqual([2, 4]);
  });

  it('makes a second run a no-op and never refetches empty rows', async () => {
    const db = await corpus([recording('r1', cover(1)), recording('r2', cover(2))]);
    await fillCoverThumbs(db, {
      fetch: fake((url) => (url === thumb(1) ? res(404, null) : res(200, 'image/webp'))).fetch,
    });
    const again = fake(() => res(200, 'image/webp'));
    const summary = await fillCoverThumbs(db, { fetch: again.fetch });
    expect(summary).toEqual({
      scanned: 0,
      filled: 0,
      marked: 0,
      deferred: 0,
      fetches: 0,
      aborted: false,
    });
    expect(again.urls).toEqual([]);
    expect((await thumbs(db)).r1).toBe('');
  });
});

describe('ensureCoverThumbIndex', () => {
  it('creates the partial index and is repeatable', async () => {
    const db = await corpus([recording('r1', cover(1))]);
    await ensureCoverThumbIndex(db);
    await ensureCoverThumbIndex(db);
    const r = await db.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'recording_cover_thumb_todo'`,
    );
    expect(r.rows).toHaveLength(1);
  });
});
