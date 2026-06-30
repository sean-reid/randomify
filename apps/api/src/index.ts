import { getCorpus } from './corpus-factory.js';
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      const corpus = getCorpus(env);
      try {
        const result = await handleSpin(corpus.provider, { excludeArtistIds: exclude });
        return json(result);
      } catch {
        return json({ error: 'corpus unavailable' }, 503);
      } finally {
        ctx.waitUntil(corpus.close().catch(() => {}));
      }
    }

    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
