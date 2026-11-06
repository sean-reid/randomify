import { isDeezerPreviewUrl } from './preview.js';

const COVER_PATH = /^(\/images\/cover\/[0-9a-f]+\/)\d+x\d+(-[\w-]+\.(?:jpg|png|webp))$/;

/** Rewrite a Deezer cover URL to a square `size` variant; anything else comes back unchanged. */
export function coverVariant(url: string, size: number): string {
  if (!isDeezerPreviewUrl(url)) return url;
  try {
    const u = new URL(url);
    const m = COVER_PATH.exec(u.pathname);
    if (!m) return url;
    u.pathname = `${m[1]}${size}x${size}${m[2]}`;
    return u.toString();
  } catch {
    return url;
  }
}
