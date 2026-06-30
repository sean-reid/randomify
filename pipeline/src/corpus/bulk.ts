import type { SqlClient } from './export.js';

/** A column in a bulk write: its name, the Postgres element type of the array
 * parameter it is sent as, and an optional cast applied per row in the SELECT
 * (used for an array-typed column, sent as text literals then cast back). */
export interface BulkColumn {
  name: string;
  /** Element type of the per-column array parameter, e.g. 'text', 'int', 'double precision'. */
  type: string;
  /** Cast applied to the column in the SELECT, e.g. 'text[]' for an array column. */
  cast?: string;
}

/** Rows per statement. One array parameter per column carries this many values,
 * so the cap is about statement size, not the 65535-parameter bind limit. */
const BULK_CHUNK = 10000;

/** Format a string list as a Postgres array literal, e.g. {"bossa nova","jazz"}. */
export function toPgArray(items: string[]): string {
  return `{${items.map((s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

/**
 * Insert (or upsert) many rows with one statement per chunk by passing each
 * column as a single array parameter and expanding them row-wise with `unnest`,
 * instead of building N-by-columns individual placeholders. This turns the full
 * backlog/corpus load from thousands of parameter-heavy round trips into a
 * handful of array binds, while staying plain SQL that both node-postgres and
 * PGlite execute identically.
 *
 * `rows` is row-major (each inner array matches `columns` order). With
 * `conflict` set it becomes an upsert that refreshes every non-key column;
 * `extraSet` appends further assignments to that update (e.g. `resolved_at = now()`).
 */
export async function bulkUpsert(
  client: SqlClient,
  table: string,
  columns: BulkColumn[],
  rows: readonly unknown[][],
  conflict?: string,
  extraSet?: string,
): Promise<void> {
  if (rows.length === 0) return;

  const names = columns.map((c) => c.name).join(', ');
  const unnestArgs = columns.map((c, i) => `$${i + 1}::${c.type}[]`).join(', ');
  const selected = columns.map((c) => (c.cast ? `${c.name}::${c.cast}` : c.name)).join(', ');
  const keys = conflict ? conflict.split(',').map((s) => s.trim()) : [];
  const updates = [
    ...columns.filter((c) => !keys.includes(c.name)).map((c) => `${c.name} = EXCLUDED.${c.name}`),
    ...(extraSet ? [extraSet] : []),
  ].join(', ');

  const sql =
    `INSERT INTO ${table} (${names})\n` +
    `SELECT ${selected} FROM unnest(${unnestArgs}) AS t(${names})` +
    (conflict ? `\nON CONFLICT (${conflict}) DO UPDATE SET ${updates}` : '');

  for (let start = 0; start < rows.length; start += BULK_CHUNK) {
    const slice = rows.slice(start, start + BULK_CHUNK);
    // Transpose row-major rows into one array parameter per column.
    const params = columns.map((_, ci) => slice.map((row) => row[ci]));
    await client.query(sql, params);
  }
}
