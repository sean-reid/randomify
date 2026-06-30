import { searchQuery } from '@randomify/shared';
import type { Candidate, Fingerprint, PlatformResolver, ResolveStrategy } from '../types.js';
import { politeFetch, rateLimitedFetch, type FetchLike } from '../http.js';

export type { FetchLike, JsonResponse } from '../http.js';

const API = 'https://api.deezer.com';

/** Default Deezer fetch: polite User-Agent, throttled well under Deezer's
 * ~50-requests-per-5s limit (~4.5/s) and backing off on 429. Shared across the
 * resolver's strategies so the whole platform stays under one rate budget. */
function defaultDeezerFetch(): FetchLike {
  return rateLimitedFetch(politeFetch, { minIntervalMs: 220 });
}

interface DeezerTrack {
  id?: number;
  title?: string;
  link?: string;
  /** Track length in seconds. */
  duration?: number;
  isrc?: string;
  artist?: { name?: string };
  album?: { title?: string; cover_big?: string; cover_xl?: string };
  /** 30-second preview MP3. */
  preview?: string;
  /** Release date, "YYYY-MM-DD"; used as a year fallback when MB has none. */
  release_date?: string;
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
    previewUrl: track.preview ?? null,
    coverArtUrl: track.album?.cover_xl ?? track.album?.cover_big ?? null,
    year: track.release_date ? Number(track.release_date.slice(0, 4)) || null : null,
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

export function buildDeezerResolver(fetchFn: FetchLike = defaultDeezerFetch()): PlatformResolver {
  return {
    platform: 'deezer',
    approach: 'isrc-api',
    strategies: [deezerIsrcStrategy(fetchFn), deezerSearchStrategy(fetchFn)],
  };
}
