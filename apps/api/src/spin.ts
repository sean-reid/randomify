import { FACETS, pickFacet, type Rng, type SpinResponse } from '@randomify/shared';
import type { CorpusProvider } from './corpus.js';

export interface SpinOptions {
  /** Artist ids seen recently in the session, to avoid immediate repeats. */
  excludeArtistIds?: ReadonlySet<string>;
  /** Override the RNG (used in tests for determinism). */
  rng?: Rng;
}

/** How many artist draws to offer the provider for anti-repeat redrawing. */
const ANTI_REPEAT_ATTEMPTS = 8;

/**
 * One spin: starting from a random facet, ask the corpus to walk the weighted
 * hierarchy down to a recording in a single round trip. A facet the corpus has
 * no values for (e.g. genres before the derived dump loads) resolves null, so
 * we fall through to the next facet and a partially-populated corpus still
 * spins. Anti-repeat happens inside the walk: we hand it several artist draws
 * and the exclude set, and it prefers the first draw avoiding a recent artist.
 */
export async function handleSpin(
  corpus: CorpusProvider,
  options: SpinOptions = {},
): Promise<SpinResponse> {
  const rng = options.rng ?? Math.random;
  const exclude = options.excludeArtistIds ?? new Set<string>();
  // No exclusions means a single artist draw suffices; only spend extra draws
  // when there is a recent artist to avoid.
  const artistDrawCount = exclude.size > 0 ? ANTI_REPEAT_ATTEMPTS : 1;

  const start = pickFacet(rng);
  const ordered = [start, ...FACETS.filter((facet) => facet !== start)];
  for (const facet of ordered) {
    const pick = await corpus.spin({
      facet,
      facetDraw: rng(),
      artistDraws: Array.from({ length: artistDrawCount }, () => rng()),
      releaseGroupDraw: rng(),
      recordingDraw: rng(),
      exclude,
    });
    if (pick) return { song: pick.song, links: pick.links, facet };
  }
  throw new Error('corpus has no facet values');
}
