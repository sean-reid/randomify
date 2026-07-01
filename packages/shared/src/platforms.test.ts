import { describe, expect, it } from 'vitest';
import { PLATFORM_BY_ID, PLATFORMS, searchLink, searchQuery, shouldShowLink } from './platforms.js';

describe('platform registry', () => {
  it('lists all eight platforms with unique ids', () => {
    expect(PLATFORMS).toHaveLength(8);
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(8);
  });

  it('indexes every platform by id', () => {
    for (const p of PLATFORMS) {
      expect(PLATFORM_BY_ID[p.id]).toBe(p);
    }
  });

  it('builds valid https search urls', () => {
    for (const p of PLATFORMS) {
      const url = p.searchUrl('test query');
      expect(url.startsWith('https://')).toBe(true);
      expect(() => new URL(url)).not.toThrow();
    }
  });

  it('marks search-fallback reliability on every platform', () => {
    for (const p of PLATFORMS) {
      expect(typeof p.searchFallbackReliable).toBe('boolean');
    }
    // Only the fractional/radio-model catalogs are unreliable.
    const unreliable = PLATFORMS.filter((p) => !p.searchFallbackReliable)
      .map((p) => p.id)
      .sort();
    expect(unreliable).toEqual(['bandcamp', 'pandora']);
  });
});

describe('shouldShowLink', () => {
  it('always shows an exact link, even on a low-coverage platform', () => {
    expect(shouldShowLink({ platform: 'bandcamp', kind: 'exact' })).toBe(true);
    expect(shouldShowLink({ platform: 'pandora', kind: 'exact' })).toBe(true);
  });

  it('shows a search fallback only for reliable big-catalog platforms', () => {
    expect(shouldShowLink({ platform: 'spotify', kind: 'search_fallback' })).toBe(true);
    expect(shouldShowLink({ platform: 'deezer', kind: 'search_fallback' })).toBe(true);
    expect(shouldShowLink({ platform: 'bandcamp', kind: 'search_fallback' })).toBe(false);
    expect(shouldShowLink({ platform: 'pandora', kind: 'search_fallback' })).toBe(false);
  });
});

describe('searchQuery', () => {
  it('joins artist and title', () => {
    expect(searchQuery('Aphex Twin', 'Xtal')).toBe('Aphex Twin Xtal');
  });
});

describe('searchLink', () => {
  it('produces a search-fallback link with an encoded query', () => {
    const link = searchLink('spotify', 'Boards of Canada', 'Roygbiv');
    expect(link.kind).toBe('search_fallback');
    expect(link.platform).toBe('spotify');
    expect(link.url).toContain('Boards%20of%20Canada%20Roygbiv');
  });
});
