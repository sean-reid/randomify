/**
 * Deezer preview URLs are short-lived signed Akamai links (they 403 within
 * hours), so a URL stored at resolution time is useless by play time. Instead
 * the corpus stores a compact, stable `/preview/{deezerTrackId}` path, and this
 * route mints a fresh preview URL on demand and redirects to it.
 */
export type PreviewFetch = (
  url: string,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * The distinct results of a preview lookup. Kept as a discriminated union
 * rather than a bare `null` so the caller can respond correctly and monitoring
 * can tell a rate-limit apart from an outage apart from a track that simply has
 * no preview. Note: Deezer signals throttling as HTTP 200 with a body
 * `error.code === 4` ("Quota limit exceeded"), not an HTTP 429.
 */
export type PreviewOutcome =
  | { kind: 'ok'; url: string }
  | { kind: 'none' } // track exists but has no preview clip
  | { kind: 'quota' } // Deezer body error.code === 4 (throttled)
  | { kind: 'deezer_error'; code?: number } // other Deezer body error, or a rejected URL
  | { kind: 'http_error'; status: number }; // non-2xx from Deezer

/** Look up a fresh preview MP3 URL for a Deezer track id. */
export async function resolvePreview(id: string, fetchFn: PreviewFetch): Promise<PreviewOutcome> {
  const res = await fetchFn(`https://api.deezer.com/2.0/track/${id}`);
  if (!res.ok) return { kind: 'http_error', status: res.status };
  const data = (await res.json()) as { preview?: unknown; error?: { code?: number } };
  if (data.error) {
    if (data.error.code === 4) return { kind: 'quota' };
    return data.error.code === undefined
      ? { kind: 'deezer_error' }
      : { kind: 'deezer_error', code: data.error.code };
  }
  if (typeof data.preview !== 'string' || !data.preview) return { kind: 'none' };
  // We 302 a browser to this URL, so constrain it: only an https Deezer CDN
  // host, never an arbitrary location a malformed/compromised response returns.
  return isDeezerPreviewUrl(data.preview)
    ? { kind: 'ok', url: data.preview }
    : { kind: 'deezer_error' };
}

/** True only for an https URL on a Deezer preview CDN host (*.dzcdn.net). */
export function isDeezerPreviewUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' && (u.hostname === 'dzcdn.net' || u.hostname.endsWith('.dzcdn.net'))
    );
  } catch {
    return false;
  }
}
