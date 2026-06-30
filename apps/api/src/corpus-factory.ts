import postgres from 'postgres';
import type { CorpusProvider } from './corpus.js';
import { DemoCorpusProvider } from './demo-corpus.js';
import { PostgresCorpusProvider, type SqlClient } from './postgres-corpus.js';
import type { Env } from './env.js';

/** A corpus provider plus a cleanup handle for any connection it opened. */
export interface CorpusHandle {
  provider: CorpusProvider;
  /** Which backend is serving: the real Postgres corpus or the demo fallback. */
  kind: 'postgres' | 'demo';
  close(): Promise<void>;
}

// The Postgres client is reused across requests within a Worker isolate (which
// Cloudflare keeps warm) so we don't pay connection setup/teardown per /spin or
// /health. Keyed by connection string; rebuilt only if Hyperdrive rotates it.
let pool: { connStr: string; client: SqlClient; end: () => Promise<void> } | null = null;

function getClient(connStr: string): SqlClient {
  if (pool?.connStr === connStr) return pool.client;
  if (pool) void pool.end().catch(() => {});
  // fetch_types: false avoids extra round-trips that don't work well through Hyperdrive.
  const sql = postgres(connStr, { max: 3, fetch_types: false });
  const client: SqlClient = {
    query: async (text, params) => ({
      rows: (await sql.unsafe(text, (params ?? []) as never[])) as unknown as Record<
        string,
        unknown
      >[],
    }),
  };
  pool = { connStr, client, end: () => sql.end() };
  return client;
}

/**
 * Build the corpus for a request. With a Hyperdrive binding the Worker serves
 * the real corpus from Neon over a Postgres connection reused across requests;
 * otherwise it falls back to the built-in demo corpus so the endpoint always
 * works. `close()` is a no-op for the real corpus (the pooled client persists).
 */
export function getCorpus(env: Env): CorpusHandle {
  if (!env.HYPERDRIVE) {
    return { provider: new DemoCorpusProvider(), kind: 'demo', close: () => Promise.resolve() };
  }
  const client = getClient(env.HYPERDRIVE.connectionString);
  return {
    provider: new PostgresCorpusProvider(client),
    kind: 'postgres',
    close: () => Promise.resolve(),
  };
}
