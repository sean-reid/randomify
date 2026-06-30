#!/usr/bin/env bash
# Convenience one-shot for dev/staging: refresh the capped backlog, resolve it,
# and rebuild weights in sequence. This is the single weekly job those small
# environments need (no separate hourly resolve - 1000 candidates resolve in one
# pass). Each step has its own flock + heartbeat via the scripts it calls.
set -euo pipefail
ENV="${1:?usage: load-small.sh <dev|staging>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$DIR/refresh-dump.sh" "$ENV"
"$DIR/resolve.sh" "$ENV"
"$DIR/rebuild-weights.sh" "$ENV"
