/**
 * Deezer preview URLs are short-lived signed Akamai links (they 403 within
 * hours), so a URL stored at resolution time is useless by play time. Instead
 * the corpus stores a compact, stable `/preview/{deezerTrackId}` path, and this
 * route mints a fresh preview URL on demand and redirects to it.
 */
export type PreviewFetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Look up a fresh preview MP3 URL for a Deezer track id. Returns null when the
 * track is unknown or has no preview.
 */
export async function resolvePreview(id: string, fetchFn: PreviewFetch): Promise<string | null> {
  const res = await fetchFn(`https://api.deezer.com/2.0/track/${id}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { preview?: unknown; error?: unknown };
  if (data.error || typeof data.preview !== 'string' || !data.preview) return null;
  return data.preview;
}
