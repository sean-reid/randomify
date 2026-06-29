import {
  DEFAULT_ALPHA,
  excludeRecent,
  pickFacet,
  weightedPick,
  type Rng,
  type SpinResponse,
} from '@randomify/shared';
import type { CorpusProvider } from './corpus.js';

export interface SpinOptions {
  /** Artist ids seen recently in the session, to avoid immediate repeats. */
  excludeArtistIds?: ReadonlySet<string>;
  /** Override the RNG (used in tests for determinism). */
  rng?: Rng;
}

/**
 * One spin: choose a facet, then walk the weighted hierarchy down to a single
 * recording and return it with its links. Every level uses the same tempered
 * weighting so prolific artists and crowded genres do not dominate.
 */
export async function handleSpin(
  corpus: CorpusProvider,
  options: SpinOptions = {},
): Promise<SpinResponse> {
  const rng = options.rng ?? Math.random;
  const exclude = options.excludeArtistIds ?? new Set<string>();

  const facet = pickFacet(rng);
  const facetValues = await corpus.facetValues(facet);
  const facetValue = weightedPick(facetValues, DEFAULT_ALPHA, rng);

  const artists = excludeRecent(
    await corpus.artistsInFacet(facet, facetValue, exclude),
    (id) => id,
    exclude,
  );
  const artistId = weightedPick(artists, DEFAULT_ALPHA, rng);

  const releaseGroups = await corpus.releaseGroups(artistId);
  const releaseGroupId = weightedPick(releaseGroups, DEFAULT_ALPHA, rng);

  const recordings = await corpus.recordings(releaseGroupId);
  const recordingId = weightedPick(recordings, DEFAULT_ALPHA, rng);

  const [song, links] = await Promise.all([
    corpus.loadSong(recordingId),
    corpus.links(recordingId),
  ]);

  return { song, links, facet };
}
