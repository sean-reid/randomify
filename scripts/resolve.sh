#!/usr/bin/env bash
# Resolve a batch of unresolved backlog recordings to streaming links and upsert
# them into the corpus. Hourly for prod (incremental growth); for dev/staging a
# single run of RESOLVE_LIMIT=1000 covers the whole capped backlog.
set -euo pipefail
ENV="${1:?usage: resolve.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"
load_env "$ENV"

job() {
  pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline build >/dev/null
  LIMIT="${RESOLVE_LIMIT:-1000}" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline resolve
}

run_job "$ENV" resolve job
