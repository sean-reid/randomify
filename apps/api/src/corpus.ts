import type { PlatformLink, Song, Facet, Weighted } from '@randomify/shared';

/**
 * The corpus, viewed as the hierarchy the sampler walks down:
 *
 *   facet value -> artist -> release group -> recording
 *
 * Each level returns candidates weighted by the number of streamable songs
 * beneath them, so the sampler core can temper and pick. Implementations back
 * this with the demo dataset (now) or Postgres prefix-sum queries (later).
 */
export interface CorpusProvider {
  /** Distinct values of a facet, weighted by streamable songs within each. */
  facetValues(facet: Facet): Promise<Weighted<string>[]>;
  /** Artists with songs in the given facet value, optionally excluding some. */
  artistsInFacet(
    facet: Facet,
    facetValue: string,
    exclude: ReadonlySet<string>,
  ): Promise<Weighted<string>[]>;
  /** Release groups by the given artist. */
  releaseGroups(artistId: string): Promise<Weighted<string>[]>;
  /** Recordings within the given release group (leaves, weight 1). */
  recordings(releaseGroupId: string): Promise<Weighted<string>[]>;
  /** Full song metadata for a recording. */
  loadSong(recordingId: string): Promise<Song>;
  /** Resolved streaming links for a recording. */
  links(recordingId: string): Promise<PlatformLink[]>;
}
