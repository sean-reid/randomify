import { PLATFORM_BY_ID, searchQuery, type PlatformId } from '@randomify/shared';
import type { Fingerprint, PlatformResolver, Resolution } from './types.js';
import { isConfident, scoreMatch } from './verify.js';

/** A search-fallback link for when no strategy yields a confident match. */
export function searchFallback(platform: PlatformId, fingerprint: Fingerprint): Resolution {
  return {
    platform,
    url: PLATFORM_BY_ID[platform].searchUrl(searchQuery(fingerprint.artist, fingerprint.title)),
    kind: 'search_fallback',
    confidence: 0,
    strategy: null,
  };
}

/**
 * Resolve one recording on one platform. Strategies run in order; a thrown or
 * empty strategy drops to the next so a broken adapter never aborts a
 * recording. ISRC-trusted candidates are taken as-is; fuzzy candidates must
 * clear the confidence threshold. Anything else degrades to a search link.
 */
export async function resolvePlatform(
  resolver: PlatformResolver,
  fingerprint: Fingerprint,
): Promise<Resolution> {
  for (const strategy of resolver.strategies) {
    let candidate;
    try {
      candidate = await strategy.run(fingerprint);
    } catch {
      continue;
    }
    if (!candidate) continue;

    if (candidate.trusted) {
      return {
        platform: resolver.platform,
        url: candidate.url,
        kind: 'exact',
        confidence: 1,
        strategy: strategy.name,
      };
    }

    const score = scoreMatch(candidate.matched, fingerprint);
    if (isConfident(score)) {
      return {
        platform: resolver.platform,
        url: candidate.url,
        kind: 'exact',
        confidence: score,
        strategy: strategy.name,
      };
    }
  }

  return searchFallback(resolver.platform, fingerprint);
}
