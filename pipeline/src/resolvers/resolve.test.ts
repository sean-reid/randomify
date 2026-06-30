import { describe, expect, it } from 'vitest';
import { resolvePlatform, searchFallback } from './resolve.js';
import type { Candidate, Fingerprint, PlatformResolver, ResolveStrategy } from './types.js';

const fingerprint: Fingerprint = {
  isrc: 'GBAYE6700477',
  artist: 'Radiohead',
  title: 'Paranoid Android',
  durationMs: 383000,
};

function strategy(name: string, result: Candidate | null): ResolveStrategy {
  return { name, run: () => Promise.resolve(result) };
}

function throwingStrategy(name: string): ResolveStrategy {
  return { name, run: () => Promise.reject(new Error('endpoint changed')) };
}

function resolver(strategies: ResolveStrategy[]): PlatformResolver {
  return { platform: 'spotify', approach: 'isrc-api', strategies };
}

describe('resolvePlatform', () => {
  it('takes a trusted ISRC candidate as an exact match', async () => {
    const r = resolver([
      strategy('isrc', {
        url: 'https://open.spotify.com/track/abc',
        matched: fingerprint,
        trusted: true,
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result).toMatchObject({ kind: 'exact', confidence: 1, strategy: 'isrc' });
  });

  it('rejects a trusted ISRC match that is a completely different song', async () => {
    // A bad ISRC that resolves to an unrelated track (the Corcovado bug).
    const r = resolver([
      strategy('isrc', {
        url: 'https://open.spotify.com/track/wrong',
        matched: { artist: 'Nelson Gonçalves', title: 'Meu Nome é Ninguém', durationMs: 190000 },
        trusted: true,
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result.kind).toBe('search_fallback');
    expect(result.strategy).toBeNull();
  });

  it('accepts a trusted ISRC match with only cosmetic metadata differences', async () => {
    const r = resolver([
      strategy('isrc', {
        url: 'https://open.spotify.com/track/ok',
        matched: { artist: 'Radiohead', title: 'Paranoid Android (Remaster)', durationMs: 384000 },
        trusted: true,
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result).toMatchObject({ kind: 'exact', confidence: 1 });
  });

  it('accepts a fuzzy candidate that clears the threshold', async () => {
    const r = resolver([
      strategy('search', {
        url: 'https://example.com/track',
        matched: { artist: 'Radiohead', title: 'Paranoid Android (Remaster)', durationMs: 384000 },
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result.kind).toBe('exact');
    expect(result.confidence).toBeGreaterThanOrEqual(0.82);
  });

  it('falls back to search when a fuzzy candidate is too weak', async () => {
    const r = resolver([
      strategy('search', {
        url: 'https://example.com/wrong',
        matched: { artist: 'Someone Else', title: 'Different Song', durationMs: 120000 },
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result.kind).toBe('search_fallback');
    expect(result.strategy).toBeNull();
  });

  it('skips a throwing strategy and uses the next one', async () => {
    const r = resolver([
      throwingStrategy('broken'),
      strategy('isrc', {
        url: 'https://open.spotify.com/track/xyz',
        matched: fingerprint,
        trusted: true,
      }),
    ]);
    const result = await resolvePlatform(r, fingerprint);
    expect(result).toMatchObject({ kind: 'exact', strategy: 'isrc' });
  });

  it('falls back to search when there are no strategies', async () => {
    const result = await resolvePlatform(resolver([]), fingerprint);
    expect(result.kind).toBe('search_fallback');
    expect(result.url).toContain('open.spotify.com/search/');
  });
});

describe('searchFallback', () => {
  it('builds an encoded search link', () => {
    const result = searchFallback('deezer', fingerprint);
    expect(result.kind).toBe('search_fallback');
    expect(result.url).toContain('deezer.com/search/');
    expect(result.url).toContain('Radiohead%20Paranoid%20Android');
  });
});
