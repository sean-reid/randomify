import { describe, expect, it, vi } from 'vitest';
import { computeState } from './neon.js';
import type { Env } from './env.js';

const env: Env = {
  NEON_API_KEY: 'k',
  NEON_PROJECT_ID: 'proj',
  NEON_ENDPOINT_ID: 'ep-one',
};

function neonResponds(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('computeState', () => {
  it('is unknown, without calling the API, when the config is incomplete', async () => {
    const fetchImpl = vi.fn();
    expect(await computeState({} as Env, fetchImpl)).toBe('unknown');
    expect(await computeState({ NEON_API_KEY: 'k' } as Env, fetchImpl)).toBe('unknown');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a suspended compute as idle', async () => {
    const fetchImpl = neonResponds(200, { endpoint: { current_state: 'idle' } });
    expect(await computeState(env, fetchImpl)).toBe('idle');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://console.neon.tech/api/v2/projects/proj/endpoints/ep-one');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('reports a running compute as active', async () => {
    const fetchImpl = neonResponds(200, { endpoint: { current_state: 'active' } });
    expect(await computeState(env, fetchImpl)).toBe('active');
  });

  it('treats a compute that is starting up as active', async () => {
    const fetchImpl = neonResponds(200, {
      endpoint: { current_state: 'idle', pending_state: 'active' },
    });
    expect(await computeState(env, fetchImpl)).toBe('active');
  });

  it('is unknown on an API error or a malformed body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await computeState(env, neonResponds(401, { message: 'nope' }))).toBe('unknown');
    expect(await computeState(env, neonResponds(200, {}))).toBe('unknown');
    const throwing = vi.fn(async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await computeState(env, throwing)).toBe('unknown');
  });
});
