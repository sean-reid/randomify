#!/usr/bin/env bash
# Shared helpers for the randomify Mac cron jobs. Sourced by each per-job script.
#
# Provides: repo-root resolution, a launchd-safe PATH, per-env config loading,
# and run_job() - a wrapper that adds a single-run lock, healthchecks.io
# heartbeat pings, and a phone (ntfy) + local failure alert around the job body.

# Repo root: scripts/ lives directly under it.
RANDOMIFY_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# launchd does NOT inherit your interactive shell PATH, so node/pnpm are not found
# unless we add them here. Adjust to wherever your node + pnpm actually live
# (`which node`, `which pnpm`) - see scripts/README.md.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/share/pnpm:$HOME/Library/pnpm:$PATH"

# load_env <env> - source data/musicbrainz/<env>.env (gitignored). Expected vars:
#   DATABASE_URL    Neon connection string for this environment's corpus
#   CANDIDATE_LIMIT cap on backlog candidates (1000 for dev/staging; unset = full, prod)
#   RESOLVE_LIMIT   recordings to resolve per run (default 1000)
#   HEALTHCHECK_URL healthchecks.io ping URL for the running job (optional)
#   NTFY_TOPIC      ntfy.sh topic for instant phone push on failure (optional, secret)
load_env() {
  local env="$1"
  local file="$RANDOMIFY_REPO/data/musicbrainz/$env.env"
  if [ ! -f "$file" ]; then
    echo "missing env file: $file" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

# hc <suffix> - ping the healthchecks.io dead-man's-switch. "" = success,
# "/start" = job started, "/fail" = job failed. No-op if HEALTHCHECK_URL unset.
hc() {
  [ -n "${HEALTHCHECK_URL:-}" ] || return 0
  curl -fsS -m 10 --retry 3 "${HEALTHCHECK_URL}${1:-}" -o /dev/null || true
}

# notify <title> <message> - instant phone push via ntfy + a local macOS banner.
notify() {
  local title="$1" message="$2"
  if [ -n "${NTFY_TOPIC:-}" ]; then
    curl -fsS -m 10 -H "Title: $title" -H "Priority: high" -H "Tags: rotating_light" \
      -d "$message" "https://ntfy.sh/${NTFY_TOPIC}" -o /dev/null || true
  fi
  osascript -e "display notification \"$message\" with title \"$title\"" >/dev/null 2>&1 || true
}

# Lock dir for the running job; released (with any job_cleanup) on exit.
_LOCKDIR=""

# Release the lock and run a job-defined `job_cleanup` if present. Bound to EXIT.
_cleanup_job() {
  if declare -F job_cleanup >/dev/null; then job_cleanup || true; fi
  [ -n "$_LOCKDIR" ] && rm -rf "$_LOCKDIR" 2>/dev/null
  return 0
}

# acquire_lock <dir> - atomic mkdir lock (portable; macOS has no flock). Reclaims
# a stale lock left by a crashed run whose PID is no longer alive.
acquire_lock() {
  local dir="$1"
  if mkdir "$dir" 2>/dev/null; then
    echo $$ >"$dir/pid"
    return 0
  fi
  local pid
  pid="$(cat "$dir/pid" 2>/dev/null || true)"
  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    rm -rf "$dir"
    if mkdir "$dir" 2>/dev/null; then
      echo $$ >"$dir/pid"
      return 0
    fi
  fi
  return 1
}

# run_job <env> <name> <fn> - run job function <fn> under a single-run lock (so a
# job never overlaps itself), bracketed by heartbeat pings, with a phone + local
# alert on failure. A job may define a `job_cleanup` function (e.g. refresh's
# scratch removal); it runs on exit alongside releasing the lock.
run_job() {
  local env="$1" name="$2" fn="$3"
  _LOCKDIR="$RANDOMIFY_REPO/data/musicbrainz/.$name-$env.lock"
  if ! acquire_lock "$_LOCKDIR"; then
    echo "[$name/$env] already running, skipping" >&2
    _LOCKDIR=""
    exit 0
  fi
  trap _cleanup_job EXIT
  # Use a per-job healthcheck if set (HEALTHCHECK_URL_REFRESH / _RESOLVE /
  # _WEIGHTS) so each cadence gets its own check; else fall back to the shared
  # HEALTHCHECK_URL (fine when an env runs a single job, e.g. dev load-small).
  local jobvar="HEALTHCHECK_URL_$(echo "$name" | tr '[:lower:]' '[:upper:]')"
  HEALTHCHECK_URL="${!jobvar:-${HEALTHCHECK_URL:-}}"
  hc /start
  if "$fn"; then
    hc
  else
    local code=$?
    hc /fail
    notify "randomify: $name failed ($env)" "exit $code - check the cron log in data/musicbrainz/logs"
    exit "$code"
  fi
}
