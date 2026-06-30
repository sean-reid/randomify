import type { CorpusProvider } from './corpus.js';
import { DemoCorpusProvider } from './demo-corpus.js';
import { handleSpin } from './spin.js';
import type { Env } from './env.js';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

/** Parse the client-held anti-repeat list from `?exclude=id1,id2`. */
function parseExclude(raw: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function getCorpus(_env: Env): CorpusProvider {
  // The Postgres-backed provider is implemented (see postgres-corpus.ts); wiring
  // it to a Hyperdrive Postgres client is the next step. Until then the Worker
  // serves the demo corpus so the endpoint stays runnable.
  return new DemoCorpusProvider();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ status: 'ok' });
    }

    if (url.pathname === '/spin') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const exclude = parseExclude(url.searchParams.get('exclude'));
      const result = await handleSpin(getCorpus(env), { excludeArtistIds: exclude });
      return json(result);
    }

    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
