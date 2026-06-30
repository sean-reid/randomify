#!/usr/bin/env bash
# Remove the launchd cron jobs for one environment: bootout each loaded job and
# delete its plist from the user's LaunchAgents.
#
#   scripts/uninstall-cron.sh dev|staging|production
set -euo pipefail
ENV="${1:?usage: uninstall-cron.sh <dev|staging|production>}"
AGENTS="$HOME/Library/LaunchAgents"

case "$ENV" in
  dev) LABELS=(com.randomify.dev-load) ;;
  staging) LABELS=(com.randomify.staging-load) ;;
  production) LABELS=(com.randomify.prod-refresh com.randomify.prod-resolve com.randomify.prod-weights) ;;
  *)
    echo "unknown env: $ENV (want dev|staging|production)" >&2
    exit 1
    ;;
esac

for label in "${LABELS[@]}"; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$AGENTS/$label.plist"
  echo "removed $label"
done
