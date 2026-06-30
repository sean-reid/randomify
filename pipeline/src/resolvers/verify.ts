import type { Fingerprint } from './types.js';

/** Strip diacritics, lowercase, and collapse to alphanumeric word tokens. */
function normalizeBase(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Remove "feat. / ft. / featuring ..." tails before matching. */
function stripFeaturing(value: string): string {
  return value.replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, ' ');
}

/** Remove parenthetical and bracketed groups (remaster, version, live, ...). */
function stripBrackets(value: string): string {
  return value.replace(/[([{][^)\]}]*[)\]}]/g, ' ');
}

export function normalizeTitle(title: string): string {
  return normalizeBase(stripFeaturing(stripBrackets(title)));
}

export function normalizeArtist(artist: string): string {
  return normalizeBase(stripFeaturing(artist));
}

function tokens(value: string): Set<string> {
  return new Set(value.split(' ').filter(Boolean));
}

/** Sorensen-Dice overlap of two token sets, in [0, 1]. */
export function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** Whether two durations agree within a tolerance (default 3s). */
export function durationWithin(
  a: number | null | undefined,
  b: number | null | undefined,
  toleranceMs = 3000,
): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= toleranceMs;
}

function durationScore(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  const diff = Math.abs(a - b);
  if (diff <= 3000) return 1;
  if (diff <= 7000) return 0.6;
  return 0;
}

/**
 * Confidence that a candidate is the same recording as the query, combining
 * title, artist, and duration agreement. Duration is dropped from the blend
 * when either side is missing rather than penalising the match.
 */
export function scoreMatch(candidate: Fingerprint, query: Fingerprint): number {
  const titleScore = diceCoefficient(
    tokens(normalizeTitle(candidate.title)),
    tokens(normalizeTitle(query.title)),
  );
  const artistScore = diceCoefficient(
    tokens(normalizeArtist(candidate.artist)),
    tokens(normalizeArtist(query.artist)),
  );
  const dur = durationScore(candidate.durationMs, query.durationMs);

  let weighted = titleScore * 0.5 + artistScore * 0.3;
  let denom = 0.8;
  if (dur != null) {
    weighted += dur * 0.2;
    denom = 1;
  }
  return weighted / denom;
}

/** Minimum score to accept a fuzzy match as an exact link. */
export const CONFIDENCE_THRESHOLD = 0.82;

export function isConfident(score: number): boolean {
  return score >= CONFIDENCE_THRESHOLD;
}

/**
 * Floor below which even an ISRC ("trusted") match is rejected. A legitimate
 * ISRC match agrees on artist and title and scores well above this; a score
 * near zero means a bad ISRC (in MusicBrainz or the platform) pointing at a
 * different song, which we must not serve as a confident link.
 */
export const SANITY_FLOOR = 0.5;

export function passesSanity(score: number): boolean {
  return score >= SANITY_FLOOR;
}
