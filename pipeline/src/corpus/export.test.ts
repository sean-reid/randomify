import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { exportCorpus, type CorpusData } from './export.js';
import { buildWeights, type StreamableRecording } from './weights.js';

const RECORDINGS: StreamableRecording[] = [
  {
    recordingId: 'r1',
    artistId: 'a1',
    releaseGroupId: 'rg1',
    genres: ['rock'],
    decade: '1990s',
    country: 'GB',
    language: 'eng',
  },
  {
    recordingId: 'r2',
    artistId: 'a1',
    releaseGroupId: 'rg1',
    genres: ['bossa nova', 'jazz'],
    decade: '1990s',
    country: 'GB',
    language: 'eng',
  },
];

function sampleData(): CorpusData {
  return {
    artists: [{ id: 'a1', name: 'Test Artist', country: 'GB' }],
    releaseGroups: [{ id: 'rg1', artistId: 'a1', title: 'Test RG', year: 1995 }],
    recordings: [
      {
        id: 'r1',
        artistId: 'a1',
        releaseGroupId: 'rg1',
        title: 'One',
        isrc: 'AAA',
        durationMs: 200000,
        year: 1995,
        language: 'eng',
        coverArtUrl: null,
        previewUrl: null,
        genres: ['rock'],
      },
      {
        id: 'r2',
        artistId: 'a1',
        releaseGroupId: 'rg1',
        title: 'Two',
        isrc: null,
        durationMs: null,
        year: 1995,
        language: 'eng',
        coverArtUrl: null,
        previewUrl: null,
        genres: ['bossa nova', 'jazz'],
      },
    ],
    links: [
      {
        recordingId: 'r1',
        platform: 'deezer',
        url: 'https://deezer/r1',
        kind: 'exact',
        confidence: 1,
      },
    ],
    weights: buildWeights(RECORDINGS),
  };
}

describe('exportCorpus against PGlite', () => {
  it('creates the schema and loads every table', async () => {
    const db = new PGlite();
    await exportCorpus(db, sampleData());

    const count = async (table: string): Promise<number> => {
      const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      return res.rows[0]!.n;
    };
    expect(await count('artist')).toBe(1);
    expect(await count('recording')).toBe(2);
    expect(await count('platform_link')).toBe(1);
    expect(await count('facet_value')).toBeGreaterThan(0);

    // genres round-trip as a text[].
    const rec = await db.query<{ genres: string[] }>(
      `SELECT genres FROM recording WHERE id = 'r2'`,
    );
    expect([...rec.rows[0]!.genres].sort()).toEqual(['bossa nova', 'jazz']);
  });

  it('keeps facet_value cum_weight monotonic in the database', async () => {
    const db = new PGlite();
    await exportCorpus(db, sampleData());
    const res = await db.query<{ cum_weight: number }>(
      `SELECT cum_weight FROM facet_value WHERE facet_type = 'genre' ORDER BY cum_weight`,
    );
    const cums = res.rows.map((r) => Number(r.cum_weight));
    for (let i = 1; i < cums.length; i++) expect(cums[i]!).toBeGreaterThan(cums[i - 1]!);
  });

  it('atomically replaces the corpus on a re-run', async () => {
    const db = new PGlite();
    await exportCorpus(db, sampleData());
    await exportCorpus(db, sampleData());
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM recording`);
    expect(res.rows[0]!.n).toBe(2);
  });
});
