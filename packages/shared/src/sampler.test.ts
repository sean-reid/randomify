import { describe, expect, it } from 'vitest';
import {
  cumulativeWeights,
  excludeRecent,
  FACETS,
  pickFacet,
  pickFromCumulative,
  temperedWeight,
  weightedPick,
  type Weighted,
} from './sampler.js';

/** Deterministic PRNG so distribution assertions are reproducible. */
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

function counts<T>(values: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

describe('temperedWeight', () => {
  it('equals the descendant count at alpha = 1', () => {
    expect(temperedWeight(500, 1)).toBe(500);
    expect(temperedWeight(1, 1)).toBe(1);
  });

  it('flattens every positive node to 1 at alpha = 0', () => {
    expect(temperedWeight(500, 0)).toBe(1);
    expect(temperedWeight(1, 0)).toBe(1);
  });

  it('is the square root at alpha = 0.5', () => {
    expect(temperedWeight(9, 0.5)).toBeCloseTo(3);
  });

  it('is zero for empty subtrees', () => {
    expect(temperedWeight(0, 0.4)).toBe(0);
  });
});

describe('pickFromCumulative', () => {
  const cum = cumulativeWeights([1, 1, 1]); // [1, 2, 3]

  it('maps draws to the correct bucket', () => {
    expect(pickFromCumulative(cum, 0)).toBe(0);
    expect(pickFromCumulative(cum, 0.9)).toBe(0);
    expect(pickFromCumulative(cum, 1)).toBe(1);
    expect(pickFromCumulative(cum, 1.5)).toBe(1);
    expect(pickFromCumulative(cum, 2)).toBe(2);
    expect(pickFromCumulative(cum, 2.99)).toBe(2);
  });
});

describe('weightedPick distribution', () => {
  const nodes: Weighted<string>[] = [
    { value: 'prolific', descendantCount: 900 },
    { value: 'modest', descendantCount: 90 },
    { value: 'rare', descendantCount: 10 },
  ];
  const N = 60_000;

  it('matches subtree proportions at alpha = 1 (uniform over songs)', () => {
    const rng = mulberry32(1);
    const picks = counts(Array.from({ length: N }, () => weightedPick(nodes, 1, rng)));
    // Expected shares: 0.9, 0.09, 0.01.
    expect((picks.get('prolific') ?? 0) / N).toBeCloseTo(0.9, 1);
    expect((picks.get('modest') ?? 0) / N).toBeCloseTo(0.09, 1);
    expect((picks.get('rare') ?? 0) / N).toBeCloseTo(0.01, 1);
  });

  it('is uniform across branches at alpha = 0', () => {
    const rng = mulberry32(2);
    const picks = counts(Array.from({ length: N }, () => weightedPick(nodes, 0, rng)));
    for (const value of ['prolific', 'modest', 'rare']) {
      expect((picks.get(value) ?? 0) / N).toBeCloseTo(1 / 3, 1);
    }
  });

  it('flattens but does not invert at the default alpha', () => {
    const rng = mulberry32(3);
    const picks = counts(Array.from({ length: N }, () => weightedPick(nodes, 0.4, rng)));
    const prolific = (picks.get('prolific') ?? 0) / N;
    const modest = (picks.get('modest') ?? 0) / N;
    const rare = (picks.get('rare') ?? 0) / N;
    // Order is preserved, but the gap is far smaller than the raw 90x/9x ratios.
    expect(prolific).toBeGreaterThan(modest);
    expect(modest).toBeGreaterThan(rare);
    expect(prolific).toBeLessThan(0.8);
    expect(rare).toBeGreaterThan(0.05);
  });

  it('throws when there are no candidates', () => {
    expect(() => weightedPick([], 0.4, Math.random)).toThrow(/no candidates/);
  });
});

describe('pickFacet', () => {
  it('only ever returns known facets and covers them all', () => {
    const rng = mulberry32(7);
    const seen = new Set(Array.from({ length: 2000 }, () => pickFacet(rng)));
    expect(seen.size).toBe(FACETS.length);
    for (const facet of seen) expect(FACETS).toContain(facet);
  });
});

describe('excludeRecent', () => {
  const nodes: Weighted<string>[] = [
    { value: 'a', descendantCount: 1 },
    { value: 'b', descendantCount: 1 },
    { value: 'c', descendantCount: 1 },
  ];
  const idOf = (v: string) => v;

  it('removes recently seen values', () => {
    const result = excludeRecent(nodes, idOf, new Set(['a', 'c']));
    expect(result.map((n) => n.value)).toEqual(['b']);
  });

  it('falls back to the full set when everything is excluded', () => {
    const result = excludeRecent(nodes, idOf, new Set(['a', 'b', 'c']));
    expect(result.map((n) => n.value)).toEqual(['a', 'b', 'c']);
  });

  it('returns the full set when nothing is excluded', () => {
    const result = excludeRecent(nodes, idOf, new Set());
    expect(result).toHaveLength(3);
  });
});
