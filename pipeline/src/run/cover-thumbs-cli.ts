import { ensureCoverThumbIndex, fillCoverThumbs } from '../corpus/cover-thumbs.js';
import { applySchema } from '../corpus/export.js';
import { rateLimitedFetch, politeBinaryFetch } from '../resolvers/http.js';
import { createLoadClient } from './db.js';
import { intEnv, optionalIntEnv } from './env.js';

/**
 * Cover-thumb fill cron entry: store a tiny base64 WebP for every recording
 * that has a cover URL and no thumb yet. Resumable; exits 2 when the CDN pushed
 * back and the run stopped early.
 *
 * DATABASE_URL      Postgres connection string for the corpus
 * LIMIT             cap on recordings scanned this run (optional)
 * BATCH_SIZE        recordings per batch (default 500)
 * MIN_INTERVAL_MS   gap between CDN requests (default 100)
 * MAX_MINUTES       stop after the batch that crosses this budget (default 55)
 * HEALTHCHECK_URL   pinged after every batch (optional)
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const limit = optionalIntEnv('LIMIT');
const batchSize = optionalIntEnv('BATCH_SIZE');
const minIntervalMs = intEnv('MIN_INTERVAL_MS', 100);
const maxMinutes = intEnv('MAX_MINUTES', 55);

const heartbeatUrl = process.env.HEALTHCHECK_URL;
async function heartbeat(): Promise<void> {
  if (!heartbeatUrl) return;
  try {
    await fetch(heartbeatUrl, { signal: AbortSignal.timeout(10_000) });
  } catch {
    // A dropped liveness ping must never fail the fill.
  }
}

const client = createLoadClient(databaseUrl);
try {
  await applySchema(client);
  await ensureCoverThumbIndex(client);
  const summary = await fillCoverThumbs(client, {
    fetch: rateLimitedFetch(politeBinaryFetch, { minIntervalMs }),
    maxMs: maxMinutes * 60_000,
    onBatch: heartbeat,
    ...(limit != null ? { limit } : {}),
    ...(batchSize != null ? { batchSize } : {}),
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.aborted) process.exitCode = 2;
} finally {
  await client.close();
}
