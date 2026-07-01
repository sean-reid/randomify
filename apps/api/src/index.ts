import { getCorpus } from './corpus-factory.js';
import { handleSpin } from './spin.js';
import { resolvePreview, type PreviewOutcome } from './preview.js';
import type { Env } from './env.js';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const PREVIEW_UA = 'randomify/0.1 (+https://randomify.dwainosaur.com)';

/**
 * Fire-and-forget per-request telemetry to Analytics Engine. No-op when the
 * METRICS binding is absent (local dev, tests). `endpoint` is the single index
 * so a hot path (preview) cannot sample away the rarer rows on another
 * (spin/health). doubles: [latency ms, 1 if a 5xx else 0].
 */
function emit(env: Env, endpoint: string, status: number, outcome: string, ms: number): void {
  env.METRICS?.writeDataPoint({
    blobs: [endpoint, outcome, String(status)],
    doubles: [ms, status >= 500 ? 1 : 0],
    indexes: [endpoint],
  });
}

/**
 * Raise a coalesced failure alert off the request path (see AlertCoalescer).
 * No-op without the ALERTS binding, and never throws into the caller.
 */
function raiseAlert(env: Env, ctx: ExecutionContext, mode: string, detail: string): void {
  if (!env.ALERTS) return;
  const stub = env.ALERTS.get(env.ALERTS.idFromName('alerts'));
  // A DO stub.fetch() is an in-process call routed by the stub id, not a network
  // request; the URL is a required placeholder and its host/path are ignored.
  ctx.waitUntil(
    stub
      .fetch('https://do/notify', { method: 'POST', body: JSON.stringify({ mode, detail }) })
      .then(() => undefined)
      .catch(() => undefined),
  );
}

/**
 * Mint a fresh Deezer preview for a track id and redirect to it. The stored
 * preview URL expires within hours, so it cannot be served directly; this route
 * resolves a fresh one at play time. The redirect is cached briefly at the edge
 * so replays and quick re-shuffles cost nothing.
 */
async function handlePreview(
  request: Request,
  id: string,
  ctx: ExecutionContext,
  env: Env,
): Promise<Response> {
  const t0 = Date.now();
  const ms = (): number => Date.now() - t0;
  if (!/^\d+$/.test(id)) {
    emit(env, 'preview', 400, 'bad_id', ms());
    return json({ error: 'bad track id' }, 400);
  }

  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) {
    emit(env, 'preview', 302, 'ok_cached', ms());
    return hit;
  }

  let outcome: PreviewOutcome;
  try {
    outcome = await resolvePreview(id, (u) => fetch(u, { headers: { 'user-agent': PREVIEW_UA } }));
  } catch (err) {
    console.error('preview fetch failed', err);
    emit(env, 'preview', 502, 'fetch_threw', ms());
    raiseAlert(env, ctx, 'preview_threw', 'preview fetch threw');
    return json({ error: 'preview unavailable' }, 502);
  }
  // Deezer throttling (200 body error.code 4) surfaces as `quota`; a real outage
  // as `http_error`; a track with no clip or a rejected URL as none/deezer_error.
  if (outcome.kind === 'quota') {
    console.error('preview deezer quota');
    emit(env, 'preview', 429, 'quota', ms());
    raiseAlert(env, ctx, 'preview_quota', 'Deezer quota limit (body error code 4)');
    return json({ error: 'busy' }, 429);
  }
  if (outcome.kind === 'http_error') {
    console.error('preview deezer http error', outcome.status);
    emit(env, 'preview', 502, 'deezer_http', ms());
    raiseAlert(env, ctx, 'preview_upstream', `Deezer HTTP ${outcome.status}`);
    return json({ error: 'preview unavailable' }, 502);
  }
  if (outcome.kind !== 'ok') {
    emit(env, 'preview', 404, outcome.kind, ms());
    return json({ error: 'no preview' }, 404);
  }

  // Only a validated preview is ever cached and served.
  emit(env, 'preview', 302, 'ok', ms());
  const res = new Response(null, {
    status: 302,
    headers: { location: outcome.url, 'cache-control': 'public, max-age=45', ...CORS_HEADERS },
  });
  ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

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
      // Deep check: confirm the corpus is actually reachable, so an external
      // uptime monitor detects a DB/Hyperdrive outage, not just a live Worker.
      const t0 = Date.now();
      const corpus = getCorpus(env);
      try {
        await corpus.provider.ping();
        return json({ status: 'ok', corpus: corpus.kind });
      } catch (err) {
        console.error('health check failed', err);
        emit(env, 'health', 503, 'db_unreachable', Date.now() - t0);
        raiseAlert(env, ctx, 'health_db', 'health DB ping failed');
        return json({ status: 'degraded', corpus: corpus.kind }, 503);
      } finally {
        ctx.waitUntil(corpus.close().catch(() => {}));
      }
    }

    if (url.pathname === '/spin') {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const t0 = Date.now();
      const exclude = parseExclude(url.searchParams.get('exclude'));
      const corpus = getCorpus(env);
      try {
        const result = await handleSpin(corpus.provider, { excludeArtistIds: exclude });
        // The corpus stores a relative /preview/{id} path; serve it from this
        // origin. A legacy absolute URL (pre-migration) is dropped, not served.
        const preview = result.song.previewUrl;
        result.song.previewUrl = preview?.startsWith('/') ? `${url.origin}${preview}` : null;
        emit(env, 'spin', 200, 'ok', Date.now() - t0);
        return json(result);
      } catch (err) {
        console.error('spin failed', err);
        emit(env, 'spin', 503, 'corpus_unavailable', Date.now() - t0);
        raiseAlert(env, ctx, 'spin_unavailable', 'corpus unavailable');
        return json({ error: 'corpus unavailable' }, 503);
      } finally {
        ctx.waitUntil(corpus.close().catch(() => {}));
      }
    }

    if (url.pathname.startsWith('/preview/')) {
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      return handlePreview(request, url.pathname.slice('/preview/'.length), ctx, env);
    }

    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;

export { AlertCoalescer } from './alerter.js';
