import type { Facet, PlatformLink, Song } from '@randomify/shared';

/**
 * The uniform draws and anti-repeat state for one spin down the four-level
 * hierarchy the sampler walks:
 *
 *   facet value -> artist -> release group -> recording
 *
 * Each level is resolved from a single uniform draw r in [0, 1) against tempered
 * weights. The artist level takes several draws so an artist seen recently can
 * be redrawn (anti-repeat) without a round trip per attempt: the provider walks
 * each draw, then prefers the first whose artist is not in `exclude`.
 */
export interface SpinInput {
  facet: Facet;
  /** Draw selecting the facet value within `facet`. */
  facetDraw: number;
  /** Ordered artist draws; the first landing on a non-excluded artist wins. */
  artistDraws: number[];
  releaseGroupDraw: number;
  recordingDraw: number;
  /** Artist ids seen recently this session, deprioritized to avoid repeats. */
  exclude: ReadonlySet<string>;
}

/** A resolved spin: the recording plus its platform links. */
export interface SpinPick {
  song: Song;
  links: PlatformLink[];
}

/**
 * The corpus as a single resolved walk. Implementations resolve the whole
 * hierarchy in one shot: the demo provider in memory, the Postgres provider in
 * one round trip against the precomputed prefix-sum index. Resolving inside the
 * provider (rather than returning candidate lists per level) keeps a popular
 * facet from loading thousands of rows per spin.
 */
export interface CorpusProvider {
  /** Cheap liveness check that the corpus is reachable; rejects if it is not. */
  ping(): Promise<void>;
  /** Walk the hierarchy for one spin. Resolves null if `facet` has no values
   * (e.g. genres before the derived dump loads), so the caller can try another. */
  spin(input: SpinInput): Promise<SpinPick | null>;
}
