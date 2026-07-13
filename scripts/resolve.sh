#!/usr/bin/env bash
# Resolve a batch of unresolved backlog recordings to streaming links and upsert
# them into the corpus. A few large, checkpointed runs per day for prod (drains
# the backlog near Deezer's polite rate, cheap on Neon since the compute suspends
# between checkpoints); for dev/staging a single small run covers the tiny backlog.
set -euo pipefail
ENV="${1:?usage: resolve.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"
load_env "$ENV"

job() {
  pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline build >/dev/null
  # HEALTHCHECK_URL (set by run_job) is forwarded so the resolver can emit a
  # per-checkpoint liveness ping during a long drain.
  LIMIT="${RESOLVE_LIMIT:-1000}" \
    CHECKPOINT_SIZE="${RESOLVE_CHECKPOINT:-}" \
    HEALTHCHECK_URL="${HEALTHCHECK_URL:-}" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline resolve
}

run_job "$ENV" resolve job
