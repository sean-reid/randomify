import type { Facet, PlatformLink, Song } from '@randomify/shared';

/**
 * The corpus as the four-level hierarchy the sampler walks:
 *
 *   facet value -> artist -> release group -> recording
 *
 * Each level is picked from a single uniform draw r in [0, 1). Implementations
 * resolve r against tempered weights: the demo provider with the shared sampler
 * core, the Postgres provider with the precomputed prefix-sum index. Picking in
 * the provider (rather than returning candidate lists) keeps a popular facet
 * from loading thousands of rows per spin.
 */
export interface CorpusProvider {
  /** Cheap liveness check that the corpus is reachable; rejects if it is not. */
  ping(): Promise<void>;
  pickFacetValue(facet: Facet, r: number): Promise<string | null>;
  pickArtist(facet: Facet, facetValue: string, r: number): Promise<string | null>;
  pickReleaseGroup(artistId: string, r: number): Promise<string | null>;
  pickRecording(releaseGroupId: string, r: number): Promise<string | null>;
  loadSong(recordingId: string): Promise<Song>;
  links(recordingId: string): Promise<PlatformLink[]>;
}
