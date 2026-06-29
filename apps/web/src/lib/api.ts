import { env } from '$env/dynamic/public';
import type { SpinResponse } from '@randomify/shared';
import type { RecentArtists } from './recent.js';

const API_BASE = env.PUBLIC_RANDOMIFY_API ?? 'http://localhost:8787';

/** Fetch one random song, excluding recently seen artists. */
export async function spin(recent: RecentArtists, signal?: AbortSignal): Promise<SpinResponse> {
  const exclude = recent.toParam();
  const query = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
  const res = await fetch(`${API_BASE}/spin${query}`, { signal });
  if (!res.ok) throw new Error(`spin request failed (${res.status})`);
  return (await res.json()) as SpinResponse;
}
