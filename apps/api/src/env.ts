/**
 * Worker bindings. `HYPERDRIVE` is absent until the corpus is provisioned; when
 * it is missing the Worker falls back to the built-in demo corpus.
 */
export interface Env {
  HYPERDRIVE?: Hyperdrive;
}
