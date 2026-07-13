import { Pool } from 'pg';
import type { SqlClient } from '../corpus/export.js';

/** A pooled corpus client for the load jobs, plus a close handle. */
export interface LoadClient extends SqlClient {
  close(): Promise<void>;
}

export interface LoadClientOptions {
  /** Max pooled connections (default 4). */
  max?: number;
  /**
   * Close idle connections after this many ms (default: pg's own, ~10s). The
   * resolver sets this low so the pool drops its connection during the long,
   * DB-idle Deezer phase between checkpoint writes; with the direct (non-pooler)
   * endpoint that lets the Neon compute auto-suspend instead of being billed for
   * hours of waiting. The pool transparently reopens on the next query.
   */
  idleTimeoutMillis?: number;
}

/**
 * Open a pooled Postgres client for a load job. A pool (rather than a single
 * long-lived Client) keeps a multi-hour load resilient: a connection dropped by
 * Neon is replaced transparently on the next query instead of killing the run.
 *
 * `transaction` pins one connection for the whole BEGIN..COMMIT, which a pool
 * requires: routing BEGIN/COMMIT through `pool.query` could land them on
 * different connections and corrupt the transaction. `withTransaction` in the
 * corpus layer calls this, so the atomic corpus and weight swaps run pinned.
 */
export function createLoadClient(
  connectionString: string,
  options: LoadClientOptions = {},
): LoadClient {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 4,
    // allowExitOnIdle lets the process exit cleanly once the pool has drained.
    ...(options.idleTimeoutMillis != null
      ? { idleTimeoutMillis: options.idleTimeoutMillis, allowExitOnIdle: true }
      : {}),
  });
  return {
    query: (sql, params) => pool.query(sql, params).then((r) => ({ rows: r.rows })),
    async transaction(fn) {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        const tx: SqlClient = {
          query: (sql, params) => conn.query(sql, params).then((r) => ({ rows: r.rows })),
        };
        const result = await fn(tx);
        await conn.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await conn.query('ROLLBACK');
        } catch {
          // The connection may already be broken; release it below regardless.
        }
        throw error;
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
}
