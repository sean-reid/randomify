import { Client } from 'pg';
import { applySchema } from '../corpus/export.js';
import { applyBacklogSchema } from './backlog.js';
import { PostgresResolutionCache } from './postgres-cache.js';
import { resolveBacklog } from './resolve-backlog.js';
import { intEnv } from './env.js';

/**
 * Incremental resolve pass for the hourly cron: resolve a chunk of unresolved
 * backlog recordings and upsert them into the serving corpus. No dump, no
 * extract - just Postgres + the throttled resolvers. Resumable across runs.
 *
 * DATABASE_URL  Postgres connection string for the corpus
 * LIMIT         how many recordings to resolve this run (default 1000)
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const limit = intEnv('LIMIT', 1000);

const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
try {
  const client = {
    query: (sql: string, params?: unknown[]) =>
      pg.query(sql, params).then((r) => ({ rows: r.rows })),
  };
  await applySchema(client);
  await applyBacklogSchema(client);
  const cache = new PostgresResolutionCache(client);
  await cache.init();

  const summary = await resolveBacklog(client, { limit, cache });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pg.end();
}
