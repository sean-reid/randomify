#!/usr/bin/env bash
# Install the launchd cron jobs for one environment into the current user's
# LaunchAgents and bootstrap them. Idempotent: re-running re-copies the plist
# and re-bootstraps (bootout first if already loaded).
#
#   scripts/install-cron.sh dev          # the weekly small load
#   scripts/install-cron.sh staging      # the weekly small load
#   scripts/install-cron.sh production   # refresh (weekly) + resolve (hourly) + weights (daily)
#
# Production jobs should only be installed once the launch gate (a good initial
# corpus) is satisfied. See scripts/README.md.
set -euo pipefail
ENV="${1:?usage: install-cron.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"

# Labels installed per environment (dev/staging run the single small load; prod
# runs the three separate-cadence jobs).
case "$ENV" in
  dev) LABELS=(com.randomify.dev-load) ;;
  staging) LABELS=(com.randomify.staging-load) ;;
  production) LABELS=(com.randomify.prod-refresh com.randomify.prod-resolve com.randomify.prod-weights) ;;
  *)
    echo "unknown env: $ENV (want dev|staging|production)" >&2
    exit 1
    ;;
esac

if [ ! -f "$REPO/data/musicbrainz/$ENV.env" ]; then
  echo "missing data/musicbrainz/$ENV.env - copy scripts/env.example and fill it in first" >&2
  exit 1
fi

mkdir -p "$AGENTS" "$REPO/data/musicbrainz/logs"

for label in "${LABELS[@]}"; do
  local_plist="$DIR/launchd/$label.plist"
  if [ ! -f "$local_plist" ]; then
    echo "missing plist: $local_plist" >&2
    exit 1
  fi
  cp "$local_plist" "$AGENTS/$label.plist"
  # Replace any existing instance so the latest plist takes effect.
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$label.plist"
  echo "installed $label"
done

echo
echo "Installed ${#LABELS[@]} job(s) for $ENV. Run one now to verify, e.g.:"
echo "  launchctl kickstart -k gui/$(id -u)/${LABELS[0]}"
echo "Check health any time with: scripts/cron-status.sh"
