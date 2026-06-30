import { describe, expect, it } from 'vitest';
import { evaluateHealth, type RunMetrics } from './health.js';

const base: RunMetrics = {
  attempts: 100,
  exactHits: 90,
  fallbacks: 10,
  errors: 0,
  canaryPass: 10,
  canaryTotal: 10,
};

describe('evaluateHealth', () => {
  it('is healthy when hits and canaries hold', () => {
    expect(evaluateHealth(base, { exactHitRate: 0.9 }).state).toBe('healthy');
  });

  it('retains the previous state when there were no attempts', () => {
    const verdict = evaluateHealth({ ...base, attempts: 0 }, { exactHitRate: 0.9 }, 'degraded');
    expect(verdict.state).toBe('degraded');
  });

  it('disables a resolver on a near-total error rate', () => {
    const verdict = evaluateHealth({ ...base, errors: 95 }, { exactHitRate: 0.9 });
    expect(verdict.state).toBe('disabled');
  });

  it('degrades on a canary collapse', () => {
    const verdict = evaluateHealth({ ...base, canaryPass: 5 }, { exactHitRate: 0.9 });
    expect(verdict.state).toBe('degraded');
    expect(verdict.reasons.join(' ')).toContain('canary');
  });

  it('degrades on an exact-hit cliff relative to baseline', () => {
    const verdict = evaluateHealth({ ...base, exactHits: 30 }, { exactHitRate: 0.9 });
    expect(verdict.state).toBe('degraded');
    expect(verdict.reasons.join(' ')).toContain('exact-hit');
  });

  it('does not penalize a legitimately low baseline platform', () => {
    // Bandcamp-style: ~5% exact is normal, so 4% is not a cliff.
    const lowMetrics: RunMetrics = {
      attempts: 100,
      exactHits: 4,
      fallbacks: 96,
      errors: 0,
      canaryPass: 0,
      canaryTotal: 0,
    };
    expect(evaluateHealth(lowMetrics, { exactHitRate: 0.05 }).state).toBe('healthy');
  });
});
