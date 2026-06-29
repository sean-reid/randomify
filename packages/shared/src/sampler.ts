import type { Facet } from './types.js';

/** A source of uniform random numbers in [0, 1). */
export type Rng = () => number;

/**
 * Tempering exponent applied to subtree sizes at every level of the walk.
 *
 *   weight(node) = descendantCount ^ alpha
 *
 *   alpha = 1  -> identical to uniform sampling over leaf songs
 *                 (prolific artists and crowded genres dominate)
 *   alpha = 0  -> uniform over children at each level
 *                 (every branch is equally likely, obscure artists over-weighted)
 *   0 < alpha < 1 -> flattens the popularity distribution without erasing it
 *
 * 0.4 leans toward discovery while keeping one-track artists from swamping the
 * catalog. It is fixed by design; randomify exposes no tuning knobs.
 */
export const DEFAULT_ALPHA = 0.4;

/** The facets a spin can walk down from, chosen at random each time. */
export const FACETS: readonly Facet[] = ['genre', 'decade', 'country', 'language'];

/** A candidate at one level of the hierarchy, weighted by its subtree size. */
export interface Weighted<T> {
  readonly value: T;
  /** Number of streamable songs reachable below this node. Always >= 1. */
  readonly descendantCount: number;
}

/** Tempered weight for a node with the given number of streamable descendants. */
export function temperedWeight(descendantCount: number, alpha: number): number {
  if (descendantCount <= 0) return 0;
  return Math.pow(descendantCount, alpha);
}

/** Prefix sums of a weight list. Mirrors the cum_weight column used in SQL. */
export function cumulativeWeights(weights: readonly number[]): number[] {
  const cum: number[] = [];
  let total = 0;
  for (const w of weights) {
    total += w;
    cum.push(total);
  }
  return cum;
}

/**
 * Index of the first entry whose cumulative weight exceeds `r`, where `r` is a
 * draw in [0, total). Binary search, O(log n), matching the indexed lookup the
 * sampler runs against Postgres.
 */
export function pickFromCumulative(cum: readonly number[], r: number): number {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r < cum[mid]!) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Picks one node, weighting each by its tempered subtree size. */
export function weightedPick<T>(nodes: readonly Weighted<T>[], alpha: number, rng: Rng): T {
  if (nodes.length === 0) throw new Error('weightedPick: no candidates');
  const weights = nodes.map((n) => temperedWeight(n.descendantCount, alpha));
  const cum = cumulativeWeights(weights);
  const total = cum[cum.length - 1]!;
  if (total <= 0) throw new Error('weightedPick: total weight is zero');
  return nodes[pickFromCumulative(cum, rng() * total)]!.value;
}

/** Picks the facet a spin walks down from. */
export function pickFacet(rng: Rng, facets: readonly Facet[] = FACETS): Facet {
  const idx = Math.floor(rng() * facets.length);
  return facets[Math.min(idx, facets.length - 1)]!;
}

/**
 * Drops candidates seen recently in the session so the same artist or genre
 * does not repeat. Falls back to the full set if everything is excluded, so a
 * spin can always resolve.
 */
export function excludeRecent<T>(
  nodes: readonly Weighted<T>[],
  idOf: (value: T) => string,
  recent: ReadonlySet<string>,
): Weighted<T>[] {
  if (recent.size === 0) return [...nodes];
  const filtered = nodes.filter((n) => !recent.has(idOf(n.value)));
  return filtered.length > 0 ? filtered : [...nodes];
}
