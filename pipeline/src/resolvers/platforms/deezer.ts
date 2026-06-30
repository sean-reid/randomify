import { searchQuery } from '@randomify/shared';
import type { Candidate, Fingerprint, PlatformResolver, ResolveStrategy } from '../types.js';

/** Minimal structural fetch so the strategies are trivial to mock and do not
 * depend on a DOM/Node lib being present in the type environment. */
export interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<JsonResponse>;

const API = 'https://api.deezer.com';

interface DeezerTrack {
  id?: number;
  title?: string;
  link?: string;
  /** Track length in seconds. */
  duration?: number;
  isrc?: string;
  artist?: { name?: string };
  album?: { title?: string };
  /** Present when Deezer reports an error (e.g. ISRC not found). */
  error?: unknown;
}

function toCandidate(track: DeezerTrack | undefined, trusted: boolean): Candidate | null {
  if (!track || track.error || !track.id || !track.link || !track.title || !track.artist?.name) {
    return null;
  }
  return {
    url: track.link,
    trusted,
    matched: {
      isrc: track.isrc ?? null,
      artist: track.artist.name,
      title: track.title,
      album: track.album?.title ?? null,
      durationMs: typeof track.duration === 'number' ? track.duration * 1000 : null,
    },
  };
}

async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`deezer responded ${res.status}`);
  return res.json();
}

/** Exact lookup by ISRC. Deezer's match is authoritative, so it is trusted. */
export function deezerIsrcStrategy(fetchFn: FetchLike = fetch): ResolveStrategy {
  return {
    name: 'deezer:isrc',
    async run(fp: Fingerprint): Promise<Candidate | null> {
      if (!fp.isrc) return null;
      const body = (await getJson(
        fetchFn,
        `${API}/2.0/track/isrc:${encodeURIComponent(fp.isrc)}`,
      )) as DeezerTrack;
      return toCandidate(body, true);
    },
  };
}

/** Fallback search by artist + title; the result is verified by the caller. */
export function deezerSearchStrategy(fetchFn: FetchLike = fetch): ResolveStrategy {
  return {
    name: 'deezer:search',
    async run(fp: Fingerprint): Promise<Candidate | null> {
      const q = encodeURIComponent(searchQuery(fp.artist, fp.title));
      const body = (await getJson(fetchFn, `${API}/2.0/search?q=${q}&limit=5`)) as {
        data?: DeezerTrack[];
      };
      return toCandidate(body?.data?.[0], false);
    },
  };
}

export function buildDeezerResolver(fetchFn: FetchLike = fetch): PlatformResolver {
  return {
    platform: 'deezer',
    approach: 'isrc-api',
    strategies: [deezerIsrcStrategy(fetchFn), deezerSearchStrategy(fetchFn)],
  };
}
