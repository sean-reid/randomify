/**
 * Per-resolver health. The pipeline records metrics every run and compares them
 * against a rolling baseline so a broken adapter is caught within one run and
 * auto-demoted to search-fallback mode rather than shipping bad data.
 */
export type ResolverState = 'healthy' | 'degraded' | 'disabled';

export interface RunMetrics {
  attempts: number;
  exactHits: number;
  fallbacks: number;
  errors: number;
  canaryPass: number;
  canaryTotal: number;
}

export interface Baseline {
  /** Trailing median exact-hit rate for this platform. */
  exactHitRate: number;
}

export interface HealthVerdict {
  state: ResolverState;
  reasons: string[];
}

/** Thresholds, relative to baseline because platforms differ wildly. */
export const HEALTH_THRESHOLDS = {
  errorRateDisable: 0.9,
  canaryRateDegrade: 0.9,
  exactHitRatioDegrade: 0.5,
};

/**
 * Evaluate a resolver's health for one run. With no attempts the previous state
 * is retained. A near-total error rate disables it; a canary collapse or an
 * exact-hit cliff relative to baseline degrades it.
 */
export function evaluateHealth(
  metrics: RunMetrics,
  baseline: Baseline | null,
  previous: ResolverState = 'healthy',
): HealthVerdict {
  const reasons: string[] = [];
  if (metrics.attempts === 0) {
    return { state: previous, reasons: ['no attempts this run'] };
  }

  const errorRate = metrics.errors / metrics.attempts;
  if (errorRate >= HEALTH_THRESHOLDS.errorRateDisable) {
    return { state: 'disabled', reasons: [`error rate ${pct(errorRate)} (endpoint likely gone)`] };
  }

  if (metrics.canaryTotal > 0) {
    const canaryRate = metrics.canaryPass / metrics.canaryTotal;
    if (canaryRate < HEALTH_THRESHOLDS.canaryRateDegrade) {
      reasons.push(`canary pass rate ${pct(canaryRate)}`);
    }
  }

  if (baseline && baseline.exactHitRate > 0) {
    const exactRate = metrics.exactHits / metrics.attempts;
    if (exactRate < baseline.exactHitRate * HEALTH_THRESHOLDS.exactHitRatioDegrade) {
      reasons.push(`exact-hit rate ${pct(exactRate)} vs baseline ${pct(baseline.exactHitRate)}`);
    }
  }

  if (reasons.length > 0) return { state: 'degraded', reasons };
  return { state: 'healthy', reasons: [] };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
