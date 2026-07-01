/**
 * Worker bindings. `HYPERDRIVE` is absent until the corpus is provisioned; when
 * it is missing the Worker falls back to the built-in demo corpus. `METRICS` is
 * an optional Analytics Engine dataset for per-request telemetry; when the
 * binding is absent (local dev, tests) emission is a no-op.
 */
export interface Env {
  HYPERDRIVE?: Hyperdrive;
  METRICS?: AnalyticsEngineDataset;
}
