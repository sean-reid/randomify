/** Read a non-negative integer env var, exiting loudly on a malformed value
 * (bare Number('oops') -> NaN silently yields zero-work downstream). */
export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`invalid ${name}: ${JSON.stringify(raw)} (want a non-negative integer)`);
    process.exit(1);
  }
  return n;
}

/** Like intEnv but returns undefined when unset (for optional caps). */
export function optionalIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw === '') return undefined;
  return intEnv(name, 0);
}
