import { describe, expect, it } from 'vitest';
import { filtersToParams, hasFilters, parseFilters } from './filters.js';
import type { SpinFilters } from './types.js';

const get =
  (params: Record<string, string>) =>
  (key: string): string | null =>
    params[key] ?? null;

describe('hasFilters', () => {
  it('is false for null, undefined, and an empty object', () => {
    expect(hasFilters(null)).toBe(false);
    expect(hasFilters(undefined)).toBe(false);
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ genres: [], decades: [] })).toBe(false);
  });

  it('is true when any dimension has a value', () => {
    expect(hasFilters({ genres: ['jazz'] })).toBe(true);
    expect(hasFilters({ decades: [1980] })).toBe(true);
    expect(hasFilters({ artistIds: ['a1'] })).toBe(true);
  });
});

describe('filtersToParams / parseFilters round-trip', () => {
  it('round-trips a full filter set', () => {
    const filters: SpinFilters = {
      genres: ['jazz', 'funk'],
      decades: [1970, 1980],
      countries: ['BR'],
      languages: ['por'],
      artistIds: ['a1', 'a2'],
    };
    const params = filtersToParams(filters);
    expect(params).toEqual({
      genres: 'jazz,funk',
      decades: '1970,1980',
      countries: 'BR',
      languages: 'por',
      artists: 'a1,a2',
    });
    expect(parseFilters(get(params))).toEqual(filters);
  });

  it('omits empty dimensions entirely', () => {
    expect(filtersToParams({ genres: [], decades: [1990] })).toEqual({ decades: '1990' });
  });
});

describe('parseFilters', () => {
  it('returns an empty object with no params (hasFilters stays false)', () => {
    const filters = parseFilters(get({}));
    expect(filters).toEqual({});
    expect(hasFilters(filters)).toBe(false);
  });

  it('drops blanks and non-integer decades', () => {
    expect(parseFilters(get({ genres: 'jazz, ,funk', decades: '1980,x,,1990.5' }))).toEqual({
      genres: ['jazz', 'funk'],
      decades: [1980],
    });
  });

  it('drops out-of-range decades (guards pg int4 and noise)', () => {
    expect(parseFilters(get({ decades: '2147483648,1700,3000,1980' }))).toEqual({
      decades: [1980],
    });
  });

  it('caps values per dimension', () => {
    const many = Array.from({ length: 200 }, (_, i) => `g${i}`).join(',');
    expect(parseFilters(get({ genres: many })).genres).toHaveLength(50);
  });
});
