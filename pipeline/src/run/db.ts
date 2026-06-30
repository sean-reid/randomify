import { Pool } from 'pg';
import type { SqlClient } from '../corpus/export.js';

/** A pooled corpus client for the load jobs, plus a close handle. */
export interface LoadClient extends SqlClient {
  close(): Promise<void>;
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
export function createLoadClient(connectionString: string, max = 4): LoadClient {
  const pool = new Pool({ connectionString, max });
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
