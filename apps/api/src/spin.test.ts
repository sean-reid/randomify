import { FACETS, PLATFORMS } from '@randomify/shared';
import { describe, expect, it } from 'vitest';
import type { CorpusProvider } from './corpus.js';
import { DemoCorpusProvider } from './demo-corpus.js';
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

describe('handleSpin', () => {
  const corpus = new DemoCorpusProvider();

  it('returns a complete spin response', async () => {
    const result = await handleSpin(corpus, { rng: mulberry32(42) });
    expect(result.song.recordingId).toBeTruthy();
    expect(result.song.title).toBeTruthy();
    expect(result.song.artist).toBeTruthy();
    expect(FACETS).toContain(result.facet);
    expect(result.links).toHaveLength(PLATFORMS.length);
  });

  it('produces links for every platform', async () => {
    const result = await handleSpin(corpus, { rng: mulberry32(7) });
    const platforms = new Set(result.links.map((l) => l.platform));
    for (const p of PLATFORMS) expect(platforms.has(p.id)).toBe(true);
  });

  it('reaches a variety of songs across many spins', async () => {
    const rng = mulberry32(123);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add((await handleSpin(corpus, { rng })).song.recordingId);
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('suppresses a recently seen artist', async () => {
    const target = 'demo-art-radiohead';
    const countAppearances = async (exclude: Set<string>): Promise<number> => {
      const rng = mulberry32(5);
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const result = await handleSpin(corpus, { excludeArtistIds: exclude, rng });
        if (result.song.artistId === target) n++;
      }
      return n;
    };
    // Same seed, so the only difference is the exclusion filter. Excluding the
    // artist must drive its appearances strictly down (anti-repeat is
    // best-effort: it can still appear when a facet value has no alternative).
    const baseline = await countAppearances(new Set());
    const suppressed = await countAppearances(new Set([target]));
    expect(baseline).toBeGreaterThan(0);
    expect(suppressed).toBeLessThan(baseline);
  });

  it('falls back to a populated facet when others are empty', async () => {
    // A corpus that only knows decades (e.g. before the genre dump is loaded).
    const decadeOnly: CorpusProvider = {
      ping: () => Promise.resolve(),
      spin: (input) =>
        Promise.resolve(
          input.facet === 'decade'
            ? {
                song: {
                  recordingId: 'r1',
                  title: 'Song',
                  artist: 'Artist',
                  artistId: 'a1',
                  releaseTitle: null,
                  releaseGroupId: 'rg1',
                  year: 1995,
                  isrc: null,
                  durationMs: null,
                  coverArtUrl: null,
                  previewUrl: null,
                  genres: [],
                },
                links: [],
              }
            : null,
        ),
    };
    for (let i = 0; i < 50; i++) {
      const result = await handleSpin(decadeOnly, { rng: mulberry32(i) });
      expect(result.facet).toBe('decade');
      expect(result.song.recordingId).toBe('r1');
    }
  });
});
