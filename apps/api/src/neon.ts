import type { Env } from './env.js';

/**
 * Whether the Neon compute behind Hyperdrive is currently running. `unknown`
 * covers a missing API configuration and any API failure, so callers fall back
 * to touching the database directly.
 */
export type ComputeState = 'idle' | 'active' | 'unknown';

const API_TIMEOUT_MS = 3_000;

/**
 * Ask the Neon API for the compute's state without connecting to it. A query
 * would wake a suspended compute and bill it for the whole autosuspend window,
 * so anything that only needs to know the corpus is healthy asks here first: an
 * idle compute is by definition not failing anyone's requests.
 */
export async function computeState(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<ComputeState> {
  const { NEON_API_KEY: key, NEON_PROJECT_ID: project, NEON_ENDPOINT_ID: endpoint } = env;
  if (!key || !project || !endpoint) return 'unknown';
  try {
    const res = await fetchImpl(
      `https://console.neon.tech/api/v2/projects/${project}/endpoints/${endpoint}`,
      {
        headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.warn(`neon endpoint lookup failed: HTTP ${res.status}`);
      return 'unknown';
    }
    const body = (await res.json()) as {
      endpoint?: { current_state?: string; pending_state?: string };
    };
    const state = body.endpoint?.current_state;
    if (!state) return 'unknown';
    // A compute already on its way up (pending_state 'active') counts as active.
    return state === 'idle' && body.endpoint?.pending_state !== 'active' ? 'idle' : 'active';
  } catch (err) {
    console.warn('neon endpoint lookup threw', err);
    return 'unknown';
  }
}
