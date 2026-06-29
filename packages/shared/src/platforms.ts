import type { PlatformId, PlatformLink } from './types.js';

export interface PlatformMeta {
  readonly id: PlatformId;
  readonly name: string;
  /** Builds a platform search URL for a free-text query. */
  readonly searchUrl: (query: string) => string;
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
  },
  {
    id: 'apple_music',
    name: 'Apple Music',
    searchUrl: (q) => `https://music.apple.com/search?term=${enc(q)}`,
  },
  {
    id: 'youtube_music',
    name: 'YouTube Music',
    searchUrl: (q) => `https://music.youtube.com/search?q=${enc(q)}`,
  },
  {
    id: 'tidal',
    name: 'Tidal',
    searchUrl: (q) => `https://tidal.com/search?q=${enc(q)}`,
  },
  {
    id: 'deezer',
    name: 'Deezer',
    searchUrl: (q) => `https://www.deezer.com/search/${enc(q)}`,
  },
  {
    id: 'amazon_music',
    name: 'Amazon Music',
    searchUrl: (q) => `https://music.amazon.com/search/${enc(q)}`,
  },
  {
    id: 'pandora',
    name: 'Pandora',
    searchUrl: (q) => `https://www.pandora.com/search/${enc(q)}/all`,
  },
  {
    id: 'bandcamp',
    name: 'Bandcamp',
    searchUrl: (q) => `https://bandcamp.com/search?q=${enc(q)}`,
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
