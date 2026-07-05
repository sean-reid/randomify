import { PGlite } from '@electric-sql/pglite';
import {
  buildFacetCatalog,
  buildSampleRows,
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

const decade = (year: number): number => Math.floor(year / 10) * 10;

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
    sampleRecordings: buildSampleRows(streamable),
    facetCatalog: buildFacetCatalog(buildSampleRows(streamable)),
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
      const result = (await handleSpin(provider, { rng }))!;
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
        const result = (await handleSpin(provider, { excludeArtistIds: exclude, rng }))!;
        if (result.song.artistId === 'a1') n++;
      }
      return n;
    };
    const baseline = await count(new Set());
    const suppressed = await count(new Set(['a1']));
    expect(baseline).toBeGreaterThan(0);
    expect(suppressed).toBeLessThan(baseline);
  });

  describe('spinFiltered', () => {
    const empty = new Set<string>();

    it('returns only recordings matching a single-dimension filter', async () => {
      for (let i = 0; i < 30; i++) {
        const pick = await provider.spinFiltered({ filters: { genres: ['rock'] }, exclude: empty });
        expect(pick).not.toBeNull();
        expect(pick!.song.genres).toContain('rock');
      }
    });

    it('ANDs dimensions and ORs within a dimension', async () => {
      // jazz AND Brazil -> only Jobim (r3); rock is GB, country is US.
      const jazzBr = await provider.spinFiltered({
        filters: { genres: ['jazz'], countries: ['BR'] },
        exclude: empty,
      });
      expect(jazzBr!.song.recordingId).toBe('r3');

      // decade 1990 (Radiohead 1997) OR 1970 (Dolly 1973), never Jobim's 1960s.
      for (let i = 0; i < 20; i++) {
        const pick = await provider.spinFiltered({
          filters: { decades: [1990, 1970] },
          exclude: empty,
        });
        expect(['r1', 'r2', 'r4']).toContain(pick!.song.recordingId);
      }
    });

    it('resolves null when nothing matches', async () => {
      const pick = await provider.spinFiltered({
        filters: { genres: ['polka'] },
        exclude: empty,
      });
      expect(pick).toBeNull();
    });

    it('deprioritizes a recently seen artist but still returns within the filter', async () => {
      // Both rock recordings are Radiohead (a1); excluding a1 must still return a
      // rock song (soft anti-repeat falls back rather than returning null).
      const pick = await provider.spinFiltered({
        filters: { genres: ['rock'] },
        exclude: new Set(['a1']),
      });
      expect(pick!.song.genres).toContain('rock');
    });
  });

  describe('facets', () => {
    const values = (list: { value: string; count: number }[]): string[] => list.map((v) => v.value);

    it('returns the full catalog with counts when unfiltered', async () => {
      const catalog = await provider.facets({});
      expect(catalog.genre.find((g) => g.value === 'rock')?.count).toBe(2); // r1, r2
      expect(values(catalog.decade)).toEqual(['1960', '1970', '1990']); // ascending
      expect(values(catalog.country).sort()).toEqual(['BR', 'GB', 'US']);
      expect(catalog.language.find((l) => l.value === 'eng')?.count).toBe(3); // r1, r2, r4
    });

    it('drills down: other dimensions narrow to the active filter', async () => {
      const catalog = await provider.facets({ countries: ['GB'] });
      // Genre/decade/language now reflect only GB songs (Radiohead).
      expect(values(catalog.genre).sort()).toEqual(['alternative', 'rock']);
      expect(values(catalog.decade)).toEqual(['1990']);
      expect(values(catalog.language)).toEqual(['eng']);
      // The country dimension itself is not collapsed by its own selection.
      expect(values(catalog.country).sort()).toEqual(['BR', 'GB', 'US']);
    });

    it('excludes a value that has no songs under the other filters', async () => {
      const catalog = await provider.facets({ genres: ['jazz'] });
      // Only Jobim (BR) is jazz, so decade collapses to the 1960s and GB drops.
      expect(values(catalog.decade)).toEqual(['1960']);
      expect(values(catalog.country)).toEqual(['BR']);
    });
  });
});
