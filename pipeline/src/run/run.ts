import { Client } from 'pg';
import { runPipeline } from './pipeline.js';
import { PostgresResolutionCache } from './postgres-cache.js';

/**
 * Pipeline entrypoint for the scheduled runner. Reads the extracted dump
 * directory and the corpus database from the environment, runs one pass, and
 * prints the summary.
 *
 * INGEST_DIR    directory of extracted MusicBrainz TSVs
 * DATABASE_URL  Postgres connection string for the corpus
 * LIMIT         optional cap on recordings resolved this run
 */
const ingestDir = process.env.INGEST_DIR;
const databaseUrl = process.env.DATABASE_URL;

if (!ingestDir || !databaseUrl) {
  console.error('INGEST_DIR and DATABASE_URL are required');
  process.exit(1);
}

const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
try {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const client = {
    query: (sql: string, params?: unknown[]) => pg.query(sql, params).then((r) => ({ rows: r.rows })),
  };
  const cache = new PostgresResolutionCache(client);
  await cache.init();
  const summary = await runPipeline({
    ingestDir,
    client,
    cache,
    ...(limit !== undefined ? { limit } : {}),
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pg.end();
}
