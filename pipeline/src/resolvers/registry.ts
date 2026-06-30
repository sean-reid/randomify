import type { PlatformResolver, ResolveApproach } from './types.js';

/**
 * Resolution approach per platform. The four with official ISRC lookup anchor
 * the canonical fingerprint; the rest are matched against it via their internal
 * JSON endpoints, with a search-link fallback.
 *
 * Strategy lists are intentionally empty here. Each platform's strategies land
 * in its own adapter module; until then every platform safely degrades to a
 * search link, which is the correct pre-implementation behaviour.
 */
const APPROACHES: Record<string, ResolveApproach> = {
  spotify: 'isrc-api',
  deezer: 'isrc-api',
  apple_music: 'isrc-api',
  tidal: 'isrc-api',
  youtube_music: 'metadata-internal',
  amazon_music: 'metadata-internal',
  pandora: 'metadata-internal',
  bandcamp: 'metadata-internal',
};

export const RESOLVERS: readonly PlatformResolver[] = (
  Object.entries(APPROACHES) as [PlatformResolver['platform'], ResolveApproach][]
).map(([platform, approach]) => ({ platform, approach, strategies: [] }));

export const RESOLVER_BY_PLATFORM = new Map(RESOLVERS.map((r) => [r.platform, r]));
