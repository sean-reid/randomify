import type { LinkKind, PlatformId, PlatformLink } from './types.js';

export interface PlatformMeta {
  readonly id: PlatformId;
  readonly name: string;
  /** Builds a platform search URL for a free-text query. */
  readonly searchUrl: (query: string) => string;
  /**
   * Whether an unverified search-fallback link is worth showing for this
   * platform. True only for full-catalog services (100M+ tracks) where a
   * search reliably surfaces the track; false for platforms whose search
   * commonly returns nothing or the wrong result (a fractional or
   * radio-model catalog). Exact links are always shown regardless.
   */
  readonly searchFallbackReliable: boolean;
}

const enc = encodeURIComponent;

/**
 * The platform registry. Order is the order links are presented in the UI:
 * the platforms with the broadest catalogs and most reliable resolution first.
 */
export const PLATFORMS: readonly PlatformMeta[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    searchUrl: (q) => `https://open.spotify.com/search/${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    searchUrl: (q) => `https://music.apple.com/search?term=${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    searchUrl: (q) => `https://music.youtube.com/search?q=${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'tidal',
    name: 'Tidal',
    searchUrl: (q) => `https://tidal.com/search?q=${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    searchUrl: (q) => `https://www.deezer.com/search/${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'amazon_music',
    name: 'Amazon Music',
    searchUrl: (q) => `https://music.amazon.com/search/${enc(q)}`,
    searchFallbackReliable: true,
  },
  {
    id: 'pandora',
    name: 'Pandora',
    searchUrl: (q) => `https://www.pandora.com/search/${enc(q)}/all`,
    // Radio/station model: search surfaces stations, not a specific track.
    searchFallbackReliable: false,
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    searchUrl: (q) => `https://bandcamp.com/search?q=${enc(q)}`,
    // Fractional, independent-artist catalog: mainstream tracks are usually absent.
    searchFallbackReliable: false,
  },
];

export const PLATFORM_BY_ID: Readonly<Record<PlatformId, PlatformMeta>> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p]),
) as Record<PlatformId, PlatformMeta>;

/** Canonical free-text query for matching or searching a recording. */
export function searchQuery(artist: string, title: string): string {
  return `${artist} ${title}`.trim();
}

/** A search-fallback link for a platform we could not resolve to an exact track. */
export function searchLink(platform: PlatformId, artist: string, title: string): PlatformLink {
  return {
    platform,
    url: PLATFORM_BY_ID[platform].searchUrl(searchQuery(artist, title)),
    kind: 'search_fallback',
  };
}

/**
 * Whether a link is worth surfacing. A verified (`exact`) link always shows,
 * including on low-coverage platforms when MusicBrainz gave us a real URL. An
 * unverified `search_fallback` shows only for platforms whose search reliably
 * finds the track, so we never present a dead-end (e.g. a mainstream track
 * searched on Bandcamp/Pandora).
 */
export function shouldShowLink(link: { platform: PlatformId; kind: LinkKind }): boolean {
  return link.kind === 'exact' || PLATFORM_BY_ID[link.platform].searchFallbackReliable;
}
