import { Client } from 'pg';
import { extractMusicBrainz } from '../ingest/musicbrainz.js';
import { runPipeline } from './pipeline.js';
import { PostgresResolutionCache } from './postgres-cache.js';

/**
 * One-time / occasional local catalog load. Reads an extracted MusicBrainz core
 * dump and writes the streamable corpus to Postgres. Run locally (the dump is
 * large); the cheap incremental resolver keeps it growing afterwards.
 *
 * MB_DUMP_DIR   directory of extracted mbdump tables (recording, isrc, ...)
 * DATABASE_URL  Postgres connection string for the corpus
 * LIMIT         optional cap on recordings resolved this run
 */
const dumpDir = process.env.MB_DUMP_DIR;
const databaseUrl = process.env.DATABASE_URL;

if (!dumpDir || !databaseUrl) {
  console.error('MB_DUMP_DIR and DATABASE_URL are required');
  process.exit(1);
}

const pg = new Client({ connectionString: databaseUrl });
await pg.connect();
try {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const extractLimit = process.env.MB_EXTRACT_LIMIT
    ? Number(process.env.MB_EXTRACT_LIMIT)
    : undefined;
  const client = {
    query: (sql: string, params?: unknown[]) =>
      pg.query(sql, params).then((r) => ({ rows: r.rows })),
  };
  const cache = new PostgresResolutionCache(client);
  await cache.init();
  const summary = await runPipeline({
    ingestDir: dumpDir,
    ingestor: extractMusicBrainz,
    client,
    cache,
    ...(limit !== undefined ? { limit } : {}),
    ...(extractLimit !== undefined ? { extractLimit } : {}),
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await pg.end();
}
