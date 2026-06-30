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
 * the real corpus from Neon over a pooled Postgres connection; otherwise it
 * falls back to the built-in demo corpus so the endpoint always works.
 */
export function getCorpus(env: Env): CorpusHandle {
  if (!env.HYPERDRIVE) {
    return { provider: new DemoCorpusProvider(), kind: 'demo', close: () => Promise.resolve() };
  }

  // fetch_types: false avoids extra round-trips that do not work well through
  // Hyperdrive; the connection is opened per request and closed after.
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
