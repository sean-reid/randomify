/**
 * Worker bindings. `HYPERDRIVE` is absent until the corpus is provisioned; when
 * it is missing the Worker falls back to the built-in demo corpus. `METRICS` is
 * an optional Analytics Engine dataset for per-request telemetry; when the
 * binding is absent (local dev, tests) emission is a no-op.
 */
export interface Env {
  HYPERDRIVE?: Hyperdrive;
  METRICS?: AnalyticsEngineDataset;
  /** Coalescing alert Durable Object; absent in local dev/tests. */
  ALERTS?: DurableObjectNamespace;
  /** ntfy topic for failure pushes (a Worker secret); absent = no push. */
  NTFY_TOPIC?: string;
  /** Neon API key (a Worker secret). With the project and endpoint ids set,
   * /health checks the compute's state before pinging it, so the monitor never
   * wakes an idle compute. Absent = always ping. */
  NEON_API_KEY?: string;
  /** Neon project id (a Worker secret, set alongside the API key). */
  NEON_PROJECT_ID?: string;
  /** Neon compute endpoint id for this environment's branch (a wrangler var). */
  NEON_ENDPOINT_ID?: string;
  /** Commit deployed, injected by the deploy workflow; absent in local dev. */
  RELEASE?: string;
}
