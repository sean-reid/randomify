import type { LinkKind, PlatformId } from '@randomify/shared';

/**
 * Everything needed to find and verify a recording on a platform. The ISRC is
 * the anchor when present; artist, title, and duration drive fuzzy matching for
 * platforms without ISRC lookup.
 */
export interface Fingerprint {
  isrc?: string | null;
  artist: string;
  title: string;
  album?: string | null;
  durationMs?: number | null;
}

/** A track a strategy found on a platform, with the metadata to verify it. */
export interface Candidate {
  url: string;
  matched: Fingerprint;
  /** True when matched by ISRC and needs no fuzzy verification. */
  trusted?: boolean;
  /** Song-level preview MP3 and cover art, when the platform exposes them. */
  previewUrl?: string | null;
  coverArtUrl?: string | null;
  /** Release year from the platform, a fallback when MusicBrainz has none. */
  year?: number | null;
}

/** One way to find a track on a platform (ISRC lookup, search, internal API). */
export interface ResolveStrategy {
  readonly name: string;
  run(fingerprint: Fingerprint): Promise<Candidate | null>;
}

/** How a platform is resolved, and whether it has an official ISRC API. */
export type ResolveApproach = 'isrc-api' | 'metadata-internal';

export interface PlatformResolver {
  readonly platform: PlatformId;
  readonly approach: ResolveApproach;
  /** Ordered strategies, tried until one yields a confident match. */
  readonly strategies: readonly ResolveStrategy[];
}

export interface Resolution {
  platform: PlatformId;
  url: string;
  kind: LinkKind;
  confidence: number;
  /** Name of the strategy that produced the link, or null for a fallback. */
  strategy: string | null;
  /** Song-level preview MP3 and cover art carried from the matched track. */
  previewUrl?: string | null;
  coverArtUrl?: string | null;
  /** Release year from the platform, a fallback when MusicBrainz has none. */
  year?: number | null;
}
