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

/**
 * Build the corpus for a request. With a Hyperdrive binding the Worker serves
 * the real corpus from Neon over a Postgres connection opened per request and
 * closed after; otherwise it falls back to the built-in demo corpus so the
 * endpoint always works.
 *
 * The client is intentionally NOT reused across requests: Cloudflare Workers
 * forbid using an I/O object (the DB socket) created in one request from a
 * different request, so a module-scoped client throws "Cannot perform I/O on
 * behalf of a different request" on a warm isolate. Hyperdrive pools the upstream
 * connections, so opening one per request is cheap and correct.
 */
export function getCorpus(env: Env): CorpusHandle {
  if (!env.HYPERDRIVE) {
    return { provider: new DemoCorpusProvider(), kind: 'demo', close: () => Promise.resolve() };
  }
  // fetch_types: false avoids extra round-trips that don't work well through Hyperdrive.
  const sql = postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
  const client: SqlClient = {
    query: async (text, params) => ({
      rows: (await sql.unsafe(text, (params ?? []) as never[])) as unknown as Record<
        string,
        unknown
      >[],
    }),
  };
  return { provider: new PostgresCorpusProvider(client), kind: 'postgres', close: () => sql.end() };
}
