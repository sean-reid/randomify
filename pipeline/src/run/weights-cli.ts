import { Client } from 'pg';
import { rebuildWeights } from './rebuild-weights.js';

/**
 * Daily weight-rebuild cron entry: recompute the prefix-sum weight index from
 * the current streamable corpus.
 *
 * DATABASE_URL  Postgres connection string for the corpus
 */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
try {
  const client = {
    query: (sql: string, params?: unknown[]) =>
      pg.query(sql, params).then((r) => ({ rows: r.rows })),
  };
  const summary = await rebuildWeights(client);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pg.end();
}
