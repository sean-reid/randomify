import { describe, expect, it } from 'vitest';
import {
  buildDeezerResolver,
  deezerIsrcStrategy,
  deezerSearchStrategy,
  type FetchLike,
} from './deezer.js';
import { resolvePlatform } from '../resolve.js';
import type { Fingerprint } from '../types.js';

const fingerprint: Fingerprint = {
  isrc: 'GBAYE6700477',
  artist: 'Radiohead',
  title: 'Paranoid Android',
  durationMs: 383000,
};

/** A FetchLike that returns the given JSON body, recording the requested URL. */
function mockFetch(body: unknown, ok = true, status = 200): FetchLike & { url?: string } {
  const fn: FetchLike & { url?: string } = (url: string) => {
    fn.url = url;
    return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
  };
  return fn;
}

const deezerTrack = {
  id: 3135556,
  title: 'Paranoid Android',
  link: 'https://www.deezer.com/track/3135556',
  duration: 383,
  isrc: 'GBAYE6700477',
  artist: { name: 'Radiohead' },
  album: { title: 'OK Computer' },
};

describe('deezerIsrcStrategy', () => {
  it('returns a trusted candidate for an ISRC hit', async () => {
    const fetchFn = mockFetch(deezerTrack);
    const candidate = await deezerIsrcStrategy(fetchFn).run(fingerprint);
    expect(fetchFn.url).toBe('https://api.deezer.com/2.0/track/isrc:GBAYE6700477');
    expect(candidate).toMatchObject({
      url: 'https://www.deezer.com/track/3135556',
      trusted: true,
      matched: { artist: 'Radiohead', title: 'Paranoid Android', durationMs: 383000 },
    });
  });

  it('returns null when Deezer reports an error', async () => {
    const candidate = await deezerIsrcStrategy(
      mockFetch({ error: { type: 'DataException', message: 'no data' } }),
    ).run(fingerprint);
    expect(candidate).toBeNull();
  });

  it('does not call the API when there is no ISRC', async () => {
    const fetchFn = mockFetch(deezerTrack);
    const candidate = await deezerIsrcStrategy(fetchFn).run({ ...fingerprint, isrc: null });
    expect(candidate).toBeNull();
    expect(fetchFn.url).toBeUndefined();
  });
});

describe('deezerSearchStrategy', () => {
  it('returns an untrusted candidate from the first search hit', async () => {
    const candidate = await deezerSearchStrategy(mockFetch({ data: [deezerTrack] })).run(
      fingerprint,
    );
    expect(candidate).toMatchObject({ trusted: false, url: deezerTrack.link });
  });

  it('returns null for an empty search', async () => {
    const candidate = await deezerSearchStrategy(mockFetch({ data: [] })).run(fingerprint);
    expect(candidate).toBeNull();
  });
});

describe('buildDeezerResolver with resolvePlatform', () => {
  it('resolves an ISRC hit to an exact link', async () => {
    const resolver = buildDeezerResolver(mockFetch(deezerTrack));
    const result = await resolvePlatform(resolver, fingerprint);
    expect(result).toMatchObject({ platform: 'deezer', kind: 'exact', strategy: 'deezer:isrc' });
  });

  it('falls back to a search link when the API errors', async () => {
    const failing: FetchLike = () =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const result = await resolvePlatform(buildDeezerResolver(failing), fingerprint);
    expect(result.kind).toBe('search_fallback');
    expect(result.url).toContain('deezer.com/search/');
  });

  it('exposes the ISRC and search strategies in order', () => {
    expect(buildDeezerResolver(mockFetch({})).strategies.map((s) => s.name)).toEqual([
      'deezer:isrc',
      'deezer:search',
    ]);
  });
});

// Opt-in live smoke test: DEEZER_LIVE=1 pnpm --filter @randomify/pipeline test
const live = process.env.DEEZER_LIVE ? it : it.skip;
describe('deezer live', () => {
  live('resolves a known ISRC against the real API', async () => {
    const candidate = await deezerIsrcStrategy().run(fingerprint);
    expect(candidate?.url).toContain('deezer.com/track/');
  });
});
