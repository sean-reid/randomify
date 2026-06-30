#!/usr/bin/env bash
# Weekly refresh: download the latest MusicBrainz dump, extract the tables we
# need, and (re)populate the candidate backlog in Neon. CANDIDATE_LIMIT caps the
# backlog so dev/staging stay tiny; prod leaves it unset for the full catalog.
#
# Self-cleaning: nukes the scratch dir BEFORE starting (leftovers from a killed
# run) and again on exit (trap), so the ~20GB dump never accumulates on disk.
set -euo pipefail
ENV="${1:?usage: refresh-dump.sh <dev|staging|production>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$DIR/lib.sh"
load_env "$ENV"

SCRATCH="$RANDOMIFY_REPO/data/musicbrainz/scratch-$ENV"
# Entity tables from the core dump.
TABLES=(recording isrc artist artist_credit_name track medium release release_group area language)
# Year (release_group_meta) and genres (genre/tag tables) live in the derived
# dump, extracted into the same mbdump/ dir; the extractor treats them as optional.
DERIVED_TABLES=(release_group_meta genre tag release_group_tag)

# Remove the (large) dump scratch on exit; run_job calls this alongside the lock
# release, so a killed run never leaves the ~20GB dump behind.
job_cleanup() { rm -rf "$SCRATCH"; }

job() {
  rm -rf "$SCRATCH"
  mkdir -p "$SCRATCH"

  local latest base members=() t
  latest="$(curl -fsSL https://data.metabrainz.org/pub/musicbrainz/data/fullexport/LATEST)"
  base="https://data.metabrainz.org/pub/musicbrainz/data/fullexport/$latest"

  # Core dump.
  curl -fSL -o "$SCRATCH/mbdump.tar.bz2" "$base/mbdump.tar.bz2"
  for t in "${TABLES[@]}"; do members+=("mbdump/$t"); done
  tar xjf "$SCRATCH/mbdump.tar.bz2" -C "$SCRATCH" "${members[@]}"
  rm -f "$SCRATCH/mbdump.tar.bz2" # free the compressed dump immediately

  # Derived dump (year + genres).
  curl -fSL -o "$SCRATCH/mbdump-derived.tar.bz2" "$base/mbdump-derived.tar.bz2"
  members=()
  for t in "${DERIVED_TABLES[@]}"; do members+=("mbdump/$t"); done
  tar xjf "$SCRATCH/mbdump-derived.tar.bz2" -C "$SCRATCH" "${members[@]}"
  rm -f "$SCRATCH/mbdump-derived.tar.bz2"

  pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline build >/dev/null
  MB_DUMP_DIR="$SCRATCH/mbdump" \
    MB_CANDIDATE_LIMIT="${CANDIDATE_LIMIT:-}" \
    DATABASE_URL="$DATABASE_URL" \
    pnpm --dir "$RANDOMIFY_REPO" --filter @randomify/pipeline refresh-backlog
}

run_job "$ENV" refresh job
