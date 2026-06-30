import { describe, expect, it } from 'vitest';
import { rateLimitedFetch, type FetchLike } from './http.js';

const ok: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> = () =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });

describe('rateLimitedFetch', () => {
  it('passes a successful response through', async () => {
    const res = await rateLimitedFetch(ok, { minIntervalMs: 1 })('u');
    expect(res.status).toBe(200);
  });

  it('retries once on 429 then returns the success', async () => {
    let calls = 0;
    const base: FetchLike = () => {
      calls += 1;
      return Promise.resolve({
        ok: calls > 1,
        status: calls > 1 ? 200 : 429,
        json: () => Promise.resolve({}),
      });
    };
    const res = await rateLimitedFetch(base, { minIntervalMs: 1, max429Retries: 2 })('u');
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it('gives up after the retry budget on persistent 429', async () => {
    let calls = 0;
    const base: FetchLike = () => {
      calls += 1;
      return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    };
    const res = await rateLimitedFetch(base, { minIntervalMs: 1, max429Retries: 2 })('u');
    expect(res.status).toBe(429);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it('spaces concurrent calls at least ~minIntervalMs apart', async () => {
    const starts: number[] = [];
    const base: FetchLike = () => {
      starts.push(Date.now());
      return ok();
    };
    const limited = rateLimitedFetch(base, { minIntervalMs: 30 });
    await Promise.all([limited('a'), limited('b'), limited('c')]);
    starts.sort((a, b) => a - b);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(20);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(20);
  });
});
