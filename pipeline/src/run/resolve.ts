import { applySchema } from '../corpus/export.js';
import { applyBacklogSchema } from './backlog.js';
import { createLoadClient } from './db.js';
import { PostgresResolutionCache } from './postgres-cache.js';
import { resolveBacklog } from './resolve-backlog.js';
import { intEnv, optionalIntEnv } from './env.js';

/**
 * Incremental resolve pass for the drain cron: resolve a chunk of unresolved
 * backlog recordings and upsert them into the serving corpus. No dump, no
 * extract - just Postgres + the throttled resolvers. Resumable across runs, and
 * a no-op (one cheap query) once the backlog is fully drained.
 *
 * DATABASE_URL     Postgres connection string for the corpus
 * LIMIT            how many recordings to resolve this run (default 1000)
 * CHECKPOINT_SIZE  resolve/persist/mark in sub-batches of this size (optional)
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const limit = intEnv('LIMIT', 1000);
const checkpointSize = optionalIntEnv('CHECKPOINT_SIZE');

// The resolver spends each checkpoint's long Deezer phase doing no DB work. Hit
// the direct (non-pooler) endpoint with a short idle timeout so the pool drops
// its connection during that phase and the Neon compute can auto-suspend, rather
// than billing us for hours held open behind the pooler. The pool reopens a
// connection transparently on the next write.
const directUrl = databaseUrl.replace('-pooler.', '.');

// Per-checkpoint liveness ping so the healthcheck can use a tight period and
// catch a hang mid-drain (run_job only pings at start/end, hours apart).
const heartbeatUrl = process.env.HEALTHCHECK_URL;
async function heartbeat(): Promise<void> {
  if (!heartbeatUrl) return;
  try {
    await fetch(heartbeatUrl, { signal: AbortSignal.timeout(10_000) });
  } catch {
    // A dropped liveness ping must never fail the drain.
  }
}

const client = createLoadClient(directUrl, { idleTimeoutMillis: 1_000 });
try {
  await applySchema(client);
  await applyBacklogSchema(client);
  const cache = new PostgresResolutionCache(client);
  await cache.init();

  const summary = await resolveBacklog(client, {
    limit,
    cache,
    onCheckpoint: heartbeat,
    ...(checkpointSize != null ? { checkpointSize } : {}),
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await client.close();
}
