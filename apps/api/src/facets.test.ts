import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import { DemoCorpusProvider } from './demo-corpus.js';
import type { Env } from './env.js';

const waitUntil = vi.fn();
const ctx = { waitUntil, passThroughOnException: () => {} } as unknown as ExecutionContext;
const env = {} as Env;

function stubCache(match: unknown = undefined) {
  const cache = { match: vi.fn(async () => match), put: vi.fn(async () => {}) };
  vi.stubGlobal('caches', { default: cache });
  return cache;
}

describe('/facets edge cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    waitUntil.mockClear();
  });

  it('caches a successful response for five minutes', async () => {
    const cache = stubCache();
    const req = new Request('https://api.test/facets');
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledWith(req, expect.any(Response));
    expect(waitUntil).toHaveBeenCalled();
  });

  it('returns a cache hit without touching the corpus', async () => {
    const hit = Response.json({ genre: [] });
    const cache = stubCache(hit);
    const facets = vi.spyOn(DemoCorpusProvider.prototype, 'facets');
    const res = await worker.fetch(new Request('https://api.test/facets'), env, ctx);
    expect(res).toBe(hit);
    expect(facets).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not cache a 405', async () => {
    const cache = stubCache();
    const res = await worker.fetch(
      new Request('https://api.test/facets', { method: 'POST' }),
      env,
      ctx,
    );
    expect(res.status).toBe(405);
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not cache a corpus failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(DemoCorpusProvider.prototype, 'facets').mockRejectedValue(new Error('down'));
    const cache = stubCache();
    const res = await worker.fetch(new Request('https://api.test/facets'), env, ctx);
    expect(res.status).toBe(503);
    expect(cache.put).not.toHaveBeenCalled();
  });
});
