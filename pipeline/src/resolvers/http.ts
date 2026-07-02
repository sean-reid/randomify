/** Minimal structural response, so resolvers are easy to mock and do not depend
 * on a DOM/Node lib being present in the type environment. */
export interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<JsonResponse>;

/** Identify ourselves politely to the APIs we call. */
export const USER_AGENT = 'randomify/0.1 (+https://randomify.net)';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A FetchLike over global fetch that sends a User-Agent. */
export const politeFetch: FetchLike = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  return { ok: res.ok, status: res.status, json: () => res.json() } satisfies JsonResponse;
};

export interface RateLimitOptions {
  /** Minimum gap between request starts (caps requests/sec). */
  minIntervalMs?: number;
  /** How many times to retry on HTTP 429 before giving up. */
  max429Retries?: number;
}

/**
 * Wrap a FetchLike so requests start at least `minIntervalMs` apart no matter
 * the caller's concurrency, and back off on HTTP 429. This keeps us well under
 * a platform's rate limit so we never get the IP flagged. The limiter is shared
 * across every call that uses the returned function (so create one per platform).
 */
export function rateLimitedFetch(base: FetchLike, options: RateLimitOptions = {}): FetchLike {
  const minIntervalMs = options.minIntervalMs ?? 250;
  const max429Retries = options.max429Retries ?? 2;
  let nextAllowedAt = 0;

  const reserveSlot = async (penaltyMs = 0): Promise<void> => {
    const now = Date.now();
    const startAt = Math.max(now, nextAllowedAt) + penaltyMs;
    nextAllowedAt = startAt + minIntervalMs;
    const wait = startAt - now;
    if (wait > 0) await delay(wait);
  };

  return async (url) => {
    for (let attempt = 0; ; attempt++) {
      await reserveSlot(attempt === 0 ? 0 : minIntervalMs * 4 * attempt);
      const res = await base(url);
      if (res.status === 429 && attempt < max429Retries) continue;
      return res;
    }
  };
}
