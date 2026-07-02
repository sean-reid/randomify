import type { SpinResponse } from '@randomify/shared';
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

/** Fetch one random song, excluding recently seen artists. */
export async function spin(recent: RecentArtists, signal?: AbortSignal): Promise<SpinResponse> {
  const exclude = recent.toParam();
  const query = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
  const res = await fetch(`${resolveApiBase()}/spin${query}`, { signal });
  if (!res.ok) throw new Error(`spin request failed (${res.status})`);
  return (await res.json()) as SpinResponse;
}
