#!/usr/bin/env bash
# Recompute the tempered prefix-sum weight index from the current streamable
# corpus. Daily for prod; once per small-load for dev/staging. O(corpus), so it
# runs on its own cadence and the resolve job leaves weights alone.
set -euo pipefail
ENV="${1:?usage: rebuild-weights.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"
load_env "$ENV"

job() {
  pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline build >/dev/null
  DATABASE_URL="$DATABASE_URL" \
    pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline rebuild-weights
}

run_job "$ENV" weights job
