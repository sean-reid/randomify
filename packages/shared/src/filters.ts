import type { SpinFilters } from './types.js';

/** Values within a dimension are joined with this in the query string. */
const DELIM = ',';

/**
 * Cap values per dimension so a hand-crafted URL cannot force a giant IN-list /
 * array-overlap into the query (cost amplification). Well above any real UI use.
 */
const MAX_VALUES_PER_DIM = 50;

/** Plausible release-decade bounds; also keeps decade ints inside pg int4. */
const MIN_DECADE = 1860;
const MAX_DECADE = 2100;

/** True when at least one dimension constrains the spin. */
export function hasFilters(filters: SpinFilters | null | undefined): boolean {
  if (!filters) return false;
  return Boolean(
    filters.genres?.length ||
    filters.decades?.length ||
    filters.countries?.length ||
    filters.languages?.length ||
    filters.artistIds?.length,
  );
}

/**
 * Serialize filters to query-string params (comma-joined). Empty dimensions are
 * omitted, so an unfiltered spin produces no params. Shared by the API request
 * and the web URL state so both sides agree on the wire format.
 */
export function filtersToParams(filters: SpinFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.genres?.length) params.genres = filters.genres.join(DELIM);
  if (filters.decades?.length) params.decades = filters.decades.join(DELIM);
  if (filters.countries?.length) params.countries = filters.countries.join(DELIM);
  if (filters.languages?.length) params.languages = filters.languages.join(DELIM);
  if (filters.artistIds?.length) params.artists = filters.artistIds.join(DELIM);
  return params;
}

/**
 * Parse filters from a query-param getter (satisfied by URLSearchParams.get).
 * Blanks and non-integer decades are dropped; a dimension with no valid values
 * is omitted entirely, so `hasFilters` on the result is a reliable signal.
 */
export function parseFilters(get: (key: string) => string | null): SpinFilters {
  const list = (key: string): string[] => {
    const raw = get(key);
    if (!raw) return [];
    return raw
      .split(DELIM)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, MAX_VALUES_PER_DIM);
  };

  const filters: SpinFilters = {};
  const genres = list('genres');
  if (genres.length) filters.genres = genres;
  const decades = list('decades')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= MIN_DECADE && n <= MAX_DECADE);
  if (decades.length) filters.decades = decades;
  const countries = list('countries');
  if (countries.length) filters.countries = countries;
  const languages = list('languages');
  if (languages.length) filters.languages = languages;
  const artists = list('artists');
  if (artists.length) filters.artistIds = artists;
  return filters;
}
