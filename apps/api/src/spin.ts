import { pickFacet, type Rng, type SpinResponse } from '@randomify/shared';
import type { CorpusProvider } from './corpus.js';

export interface SpinOptions {
  /** Artist ids seen recently in the session, to avoid immediate repeats. */
  excludeArtistIds?: ReadonlySet<string>;
  /** Override the RNG (used in tests for determinism). */
  rng?: Rng;
}

/** How many times to redraw an artist before accepting a recently seen one. */
const ANTI_REPEAT_ATTEMPTS = 8;

/**
 * One spin: choose a facet, then walk the weighted hierarchy down to a single
 * recording and return it with its links. Anti-repeat is best effort: an
 * artist seen recently is redrawn a few times, then accepted if the facet value
 * offers no alternative, so a spin always resolves.
 */
export async function handleSpin(
  corpus: CorpusProvider,
  options: SpinOptions = {},
): Promise<SpinResponse> {
  const rng = options.rng ?? Math.random;
  const exclude = options.excludeArtistIds ?? new Set<string>();

  const facet = pickFacet(rng);
  const facetValue = await corpus.pickFacetValue(facet, rng());
  if (!facetValue) throw new Error(`no facet values for ${facet}`);

  let artistId: string | null = null;
  for (let attempt = 0; attempt < ANTI_REPEAT_ATTEMPTS; attempt++) {
    const candidate = await corpus.pickArtist(facet, facetValue, rng());
    if (!candidate) break;
    artistId = candidate;
    if (!exclude.has(candidate)) break;
  }
  if (!artistId) throw new Error(`no artists for ${facet}:${facetValue}`);

  const releaseGroupId = await corpus.pickReleaseGroup(artistId, rng());
  if (!releaseGroupId) throw new Error(`no release groups for artist ${artistId}`);

  const recordingId = await corpus.pickRecording(releaseGroupId, rng());
  if (!recordingId) throw new Error(`no recordings for release group ${releaseGroupId}`);

  const [song, links] = await Promise.all([
    corpus.loadSong(recordingId),
    corpus.links(recordingId),
  ]);

  return { song, links, facet };
}
