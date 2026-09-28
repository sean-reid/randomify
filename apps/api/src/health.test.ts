import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';
import type { Env } from './env.js';

// Nothing listens here, so any attempt to ping the database fails the check.
const HYPERDRIVE = { connectionString: 'postgres://u:p@127.0.0.1:1/db' } as Hyperdrive;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

function neonSays(state: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ endpoint: { current_state: state } })),
  );
}

async function health(env: Env): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await worker.fetch(new Request('https://api.test/health'), env, ctx);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('/health', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers ok without touching an idle Neon compute', async () => {
    neonSays('idle');
    const { status, body } = await health({
      HYPERDRIVE,
      NEON_API_KEY: 'k',
      NEON_PROJECT_ID: 'proj',
      NEON_ENDPOINT_ID: 'ep',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', corpus: 'postgres', compute: 'idle' });
  });

  it('pings the database when the compute is active', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    neonSays('active');
    const { status, body } = await health({
      HYPERDRIVE,
      NEON_API_KEY: 'k',
      NEON_PROJECT_ID: 'proj',
      NEON_ENDPOINT_ID: 'ep',
    });
    expect(status).toBe(503);
    expect(body).toEqual({ status: 'degraded', corpus: 'postgres' });
  });

  it('pings the database when the Neon API is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { status } = await health({ HYPERDRIVE });
    expect(status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never consults Neon for the demo corpus', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { status, body } = await health({
      NEON_API_KEY: 'k',
      NEON_PROJECT_ID: 'p',
      NEON_ENDPOINT_ID: 'e',
    });
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', corpus: 'demo', compute: 'unknown' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
