import {
  filtersToParams,
  type ArtistHit,
  type FacetCatalog,
  type SpinFilters,
  type SpinResponse,
} from '@randomify/shared';
import type { RecentArtists } from './recent.js';

/** The environment's API base, inlined at build time (see vite.config.ts). */
declare const __RANDOMIFY_API__: string;

/** Dev API for preview deployments (*.pages.dev) and other non-environment hosts. */
const DEV_API = 'https://api.dev.randomify.net';

/**
 * Resolve the API base. Production, staging, and dev builds bake in their own
 * `PUBLIC_RANDOMIFY_API` at build time, so there is no runtime guessing. Local
 * dev hits the local Worker; preview builds fall back to the dev API.
 */
export function resolveApiBase(): string {
  const configured = typeof __RANDOMIFY_API__ === 'string' ? __RANDOMIFY_API__ : '';
  if (configured) return configured;
  if (typeof location !== 'undefined') {
    const { hostname } = location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8787';
  }
  return DEV_API;
}

/** Append query params to a path, omitting the `?` when there are none. */
function withParams(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Fetch one random song, excluding recently seen artists and honoring any active
 * filters. Resolves null when filters are set but nothing matches (the API
 * returns 200 with a null song), so the caller can prompt to loosen filters
 * rather than treat it as an error.
 */
export async function spin(
  recent: RecentArtists,
  filters: SpinFilters = {},
  signal?: AbortSignal,
): Promise<SpinResponse | null> {
  const params = filtersToParams(filters);
  const exclude = recent.toParam();
  if (exclude) params.exclude = exclude;
  const res = await fetch(withParams(`${resolveApiBase()}/spin`, params), { signal });
  if (!res.ok) throw new Error(`spin request failed (${res.status})`);
  const data = (await res.json()) as { song: SpinResponse['song'] | null } & SpinResponse;
  return data.song ? data : null;
}

/** Available filter values per dimension, narrowed by the active filters. */
export async function fetchFacets(
  filters: SpinFilters = {},
  signal?: AbortSignal,
): Promise<FacetCatalog> {
  const res = await fetch(withParams(`${resolveApiBase()}/facets`, filtersToParams(filters)), {
    signal,
  });
  if (!res.ok) throw new Error(`facets request failed (${res.status})`);
  return (await res.json()) as FacetCatalog;
}

/** Search artists by name fragment, restricted to those matching the filters. */
export async function searchArtists(
  query: string,
  filters: SpinFilters = {},
  signal?: AbortSignal,
): Promise<ArtistHit[]> {
  const params = filtersToParams(filters);
  params.q = query;
  const res = await fetch(withParams(`${resolveApiBase()}/artists`, params), { signal });
  if (!res.ok) throw new Error(`artists request failed (${res.status})`);
  return (await res.json()) as ArtistHit[];
}
