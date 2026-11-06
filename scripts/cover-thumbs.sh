#!/usr/bin/env bash
# Cover thumbnail fill: hourly for prod, once per small-load for dev/staging.
# Resumable, and exits non-zero when the CDN pushes back so the alert fires.
set -euo pipefail
ENV="${1:?usage: cover-thumbs.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"
load_env "$ENV"

job() {
  pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline build >/dev/null
  MAX_MINUTES="${THUMBS_MAX_MINUTES:-}" \
    MIN_INTERVAL_MS="${THUMBS_MIN_INTERVAL_MS:-}" \
    HEALTHCHECK_URL="${HEALTHCHECK_URL:-}" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline cover-thumbs
}

run_job "$ENV" thumbs job
