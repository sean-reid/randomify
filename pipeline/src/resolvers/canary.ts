import type { PlatformId } from '@randomify/shared';

/**
 * A golden-set entry: a well-known ISRC with its known-correct URL on each
 * platform. Run every pipeline pass (and nightly in CI) so a resolver that
 * stops returning the known link fails loudly the moment it breaks.
 */
export interface GoldenEntry {
  isrc: string;
  title: string;
  artist: string;
  expected: Partial<Record<PlatformId, string>>;
}

export interface CanaryResult {
  platform: PlatformId;
  isrc: string;
  expected: string;
  actual: string | null;
  pass: boolean;
}

export interface CanarySummary {
  total: number;
  passed: number;
  failures: CanaryResult[];
  /** Pass counts per platform, for feeding RunMetrics.canary*. */
  byPlatform: Record<string, { total: number; passed: number }>;
}

/**
 * Compare resolved URLs against the golden set. `resolvedFor` returns the URL a
 * resolver produced for a given ISRC and platform, or null.
 */
export function checkCanary(
  golden: readonly GoldenEntry[],
  resolvedFor: (isrc: string, platform: PlatformId) => string | null,
): CanarySummary {
  const failures: CanaryResult[] = [];
  const byPlatform: Record<string, { total: number; passed: number }> = {};
  let total = 0;
  let passed = 0;

  for (const entry of golden) {
    for (const [platform, expected] of Object.entries(entry.expected) as [PlatformId, string][]) {
      const actual = resolvedFor(entry.isrc, platform);
      const pass = actual === expected;
      total += 1;
      if (pass) passed += 1;

      const bucket = (byPlatform[platform] ??= { total: 0, passed: 0 });
      bucket.total += 1;
      if (pass) bucket.passed += 1;

      if (!pass) failures.push({ platform, isrc: entry.isrc, expected, actual, pass });
    }
  }

  return { total, passed, failures, byPlatform };
}
