#!/usr/bin/env bash
# Show local cron health: the last recorded run of each job, which launchd jobs
# are loaded, and the most recent run history. Reads the run records written by
# run_job (see lib.sh record_run). Off-Mac alerting still lives in
# healthchecks.io + ntfy; this is the at-a-glance local view.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
LOGS="$REPO/data/musicbrainz/logs"

echo "== last run per job =="
if compgen -G "$LOGS/*.status" >/dev/null; then
  # Newest first; flag anything that did not end ok.
  for f in "$LOGS"/*.status; do
    line="$(cat "$f")"
    case "$line" in
      *" ok "*) echo "  $line" ;;
      *) echo "  $line   <== CHECK" ;;
    esac
  done
else
  echo "  (no runs recorded yet)"
fi

echo
echo "== loaded launchd jobs =="
if launchctl list 2>/dev/null | grep -q com.randomify; then
  launchctl list 2>/dev/null | grep com.randomify | awk '{printf "  pid=%s\tlast_exit=%s\t%s\n", $1, $2, $3}'
else
  echo "  (none loaded - install with scripts/install-cron.sh <env>)"
fi

echo
echo "== recent run history =="
if [ -f "$LOGS/runs.jsonl" ]; then
  tail -n 10 "$LOGS/runs.jsonl" | sed 's/^/  /'
else
  echo "  (no history yet)"
fi
