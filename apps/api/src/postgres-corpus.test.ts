import { PGlite } from '@electric-sql/pglite';
import {
  buildWeights,
  exportCorpus,
  type CorpusData,
  type StreamableRecording,
} from '@randomify/pipeline';
import { beforeAll, describe, expect, it } from 'vitest';
import type { SpinInput } from './corpus.js';
import { PostgresCorpusProvider, type SqlClient } from './postgres-corpus.js';
import { handleSpin } from './spin.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Seed {
  id: string;
  artistId: string;
  artist: string;
  releaseGroupId: string;
  releaseTitle: string;
  title: string;
  year: number;
  genres: string[];
  country: string;
  language: string;
}

const SEEDS: Seed[] = [
  {
    id: 'r1',
    artistId: 'a1',
    artist: 'Radiohead',
    releaseGroupId: 'rg1',
    releaseTitle: 'OK Computer',
    title: 'Paranoid Android',
    year: 1997,
    genres: ['rock', 'alternative'],
    country: 'GB',
    language: 'eng',
  },
  {
    id: 'r2',
    artistId: 'a1',
    artist: 'Radiohead',
    releaseGroupId: 'rg1',
    releaseTitle: 'OK Computer',
    title: 'Karma Police',
    year: 1997,
    genres: ['rock'],
    country: 'GB',
    language: 'eng',
  },
  {
    id: 'r3',
    artistId: 'a2',
    artist: 'Antônio Carlos Jobim',
    releaseGroupId: 'rg2',
    releaseTitle: 'Songbook',
    title: 'Corcovado',
    year: 1963,
    genres: ['jazz', 'bossa nova'],
    country: 'BR',
    language: 'por',
  },
  {
    id: 'r4',
    artistId: 'a3',
    artist: 'Dolly Parton',
    releaseGroupId: 'rg3',
    releaseTitle: 'Jolene',
    title: 'Jolene',
    year: 1973,
    genres: ['country'],
    country: 'US',
    language: 'eng',
  },
];

const decade = (year: number): string => `${Math.floor(year / 10) * 10}s`;

function corpusData(seeds: Seed[] = SEEDS): CorpusData {
  const streamable: StreamableRecording[] = seeds.map((s) => ({
    recordingId: s.id,
    artistId: s.artistId,
    releaseGroupId: s.releaseGroupId,
    genres: s.genres,
    decade: decade(s.year),
    country: s.country,
    language: s.language,
  }));
  return {
    artists: [
      ...new Map(
        seeds.map((s) => [s.artistId, { id: s.artistId, name: s.artist, country: s.country }]),
      ).values(),
    ],
    releaseGroups: [
      ...new Map(
        seeds.map((s) => [
          s.releaseGroupId,
          { id: s.releaseGroupId, artistId: s.artistId, title: s.releaseTitle, year: s.year },
        ]),
      ).values(),
    ],
    recordings: seeds.map((s) => ({
      id: s.id,
      artistId: s.artistId,
      releaseGroupId: s.releaseGroupId,
      title: s.title,
      isrc: null,
      durationMs: 200000,
      year: s.year,
      language: s.language,
      coverArtUrl: null,
      previewUrl: null,
      genres: s.genres,
    })),
    links: seeds.map((s) => ({
      recordingId: s.id,
      platform: 'deezer' as const,
      url: `https://www.deezer.com/track/${s.id}`,
      kind: 'exact' as const,
      confidence: 1,
    })),
    weights: buildWeights(streamable),
  };
}

/** Build a provider over the given seeds in a fresh in-memory database. */
async function providerFor(seeds: Seed[]): Promise<PostgresCorpusProvider> {
  const db = new PGlite();
  await exportCorpus(db, corpusData(seeds));
  return new PostgresCorpusProvider({ query: (sql, params) => db.query(sql, params) });
}

/** A spin input pinned to one path, varying only the recording draw. The solo
 * corpora below have a single facet value / artist / release group, so the
 * facet, artist, and release-group draws are immaterial. */
function recordingProbe(recordingDraw: number): SpinInput {
  return {
    facet: 'decade',
    facetDraw: 0,
    artistDraws: [0],
    releaseGroupDraw: 0,
    recordingDraw,
    exclude: new Set(),
  };
}

describe('PostgresCorpusProvider', () => {
  let provider: PostgresCorpusProvider;

  beforeAll(async () => {
    const db = new PGlite();
    const client: SqlClient = { query: (sql, params) => db.query(sql, params) };
    await exportCorpus(db, corpusData());
    provider = new PostgresCorpusProvider(client);
  });

  it('ping resolves when the corpus has recordings', async () => {
    await expect(provider.ping()).resolves.toBeUndefined();
  });

  it('ping rejects when the corpus is empty', async () => {
    const empty = new PGlite();
    await exportCorpus(empty, { ...corpusData(), recordings: [], links: [] });
    const emptyProvider = new PostgresCorpusProvider({
      query: (sql, params) => empty.query(sql, params),
    });
    await expect(emptyProvider.ping()).rejects.toThrow();
  });

  it('handles the recording draw -> 1.0 boundary (clamped to the last recording)', async () => {
    // Without the LEAST clamp, floor(1*m)+1 = m+1 misses every row and returns null.
    const pair = await providerFor([SEEDS[0]!, SEEDS[1]!]); // both a1 / rg1
    const pick = await pair.spin(recordingProbe(1));
    expect(pick).not.toBeNull();
    expect(['r1', 'r2']).toContain(pick?.song.recordingId);
  });

  it('walks to valid songs from the seeded corpus', async () => {
    const rng = mulberry32(1);
    const ids = new Set<string>();
    const validIds = new Set(SEEDS.map((s) => s.id));
    for (let i = 0; i < 100; i++) {
      const result = await handleSpin(provider, { rng });
      expect(validIds.has(result.song.recordingId)).toBe(true);
      expect(result.links).toHaveLength(1); // only the deezer link was seeded
      expect(result.links[0]?.platform).toBe('deezer');
      ids.add(result.song.recordingId);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('loads full song metadata and links', async () => {
    const solo = await providerFor([SEEDS[0]!]); // single recording, any draw lands on it
    const pick = await solo.spin(recordingProbe(0));
    expect(pick?.song).toMatchObject({
      recordingId: 'r1',
      title: 'Paranoid Android',
      artist: 'Radiohead',
      artistId: 'a1',
      releaseTitle: 'OK Computer',
      year: 1997,
    });
    expect([...(pick?.song.genres ?? [])].sort()).toEqual(['alternative', 'rock']);
    expect(pick?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/track/r1', kind: 'exact' },
    ]);
  });

  it('maps the recording draw extremes to the ends of a partition', async () => {
    const pair = await providerFor([SEEDS[0]!, SEEDS[1]!]); // both a1 / rg1
    const low = (await pair.spin(recordingProbe(0)))?.song.recordingId;
    const high = (await pair.spin(recordingProbe(0.999)))?.song.recordingId;
    expect([low, high].sort()).toEqual(['r1', 'r2']);
    expect(low).not.toBe(high);
  });

  it('suppresses a recently seen artist', async () => {
    const count = async (exclude: Set<string>): Promise<number> => {
      const rng = mulberry32(5);
      let n = 0;
      for (let i = 0; i < 200; i++) {
        const result = await handleSpin(provider, { excludeArtistIds: exclude, rng });
        if (result.song.artistId === 'a1') n++;
      }
      return n;
    };
    const baseline = await count(new Set());
    const suppressed = await count(new Set(['a1']));
    expect(baseline).toBeGreaterThan(0);
    expect(suppressed).toBeLessThan(baseline);
  });
});
