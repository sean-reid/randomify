import { env } from '$env/dynamic/public';
import type { SpinResponse } from '@randomify/shared';
import type { RecentArtists } from './recent.js';

/**
 * Resolve the API base. Each web host has a matching API host (api.<host>), so
 * production, staging, and dev all wire up with no per-environment config.
 * PUBLIC_RANDOMIFY_API overrides it when set (handy for local dev).
 */
export function resolveApiBase(): string {
  const override = env.PUBLIC_RANDOMIFY_API;
  if (override) return override;
  if (typeof location !== 'undefined') {
    const { protocol, hostname } = location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8787';
    return `${protocol}//api.${hostname}`;
  }
  return 'http://localhost:8787';
}

/** Fetch one random song, excluding recently seen artists. */
export async function spin(recent: RecentArtists, signal?: AbortSignal): Promise<SpinResponse> {
  const exclude = recent.toParam();
  const query = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
  const res = await fetch(`${resolveApiBase()}/spin${query}`, { signal });
  if (!res.ok) throw new Error(`spin request failed (${res.status})`);
  return (await res.json()) as SpinResponse;
}
