# Cron jobs (Mac / launchd)

The corpus is kept fresh by jobs that run on a Mac via `launchd`. Each job is
**idempotent and checkpointed** (the candidate backlog lives in Neon with a
`resolved_at` cursor), so a skipped or repeated run only causes drift, never
corruption.

## The jobs

| Script                     | What it does                                                   | prod cadence  |
| -------------------------- | -------------------------------------------------------------- | ------------- |
| `refresh-dump.sh <env>`    | download latest MB dump → extract → (re)populate the backlog   | weekly        |
| `resolve.sh <env>`         | resolve a batch of backlog recordings → upsert into the corpus | hourly (prod) |
| `rebuild-weights.sh <env>` | recompute the tempered prefix-sum weight index                 | daily         |
| `load-small.sh <env>`      | one-shot: refresh → resolve → weights (for dev/staging)        | weekly        |

**Per-environment corpus size.** `dev`/`staging` set `CANDIDATE_LIMIT=1000` so the
backlog - and therefore the corpus - can never exceed ~1000 (~877 streamable).
`production` leaves `CANDIDATE_LIMIT` unset and grows the full ~6M-recording
catalog incrementally via the hourly resolve. So dev/staging only need the single
weekly `load-small`; only prod runs the separate hourly/daily jobs.

## Config

Each script reads `data/musicbrainz/<env>.env` (gitignored). Create them from the
template:

```sh
cp scripts/env.example data/musicbrainz/dev.env        # CANDIDATE_LIMIT=1000
cp scripts/env.example data/musicbrainz/staging.env    # CANDIDATE_LIMIT=1000
cp scripts/env.example data/musicbrainz/production.env # CANDIDATE_LIMIT unset
```

## Install (launchd)

One script installs the right jobs for an environment (copies the plists into
`~/Library/LaunchAgents` and bootstraps them):

```sh
scripts/install-cron.sh dev          # weekly small load
scripts/install-cron.sh staging      # weekly small load
scripts/install-cron.sh production   # refresh (weekly) + resolve (hourly) + weights (daily)

# run a job once to verify (the installer prints the exact label):
launchctl kickstart -k gui/$(id -u)/com.randomify.dev-load
```

`dev` and `staging` each install a single weekly `*-load` job; `production`
installs the three separate-cadence jobs. Install `production` (and `staging`)
**only after** the prod launch gate (a good initial corpus) is satisfied.

Remove an environment's jobs with `scripts/uninstall-cron.sh <env>`.

### PATH caveat

`launchd` does **not** inherit your interactive shell `PATH`, so `node`/`pnpm`
won't be found unless their locations are on the `PATH` set in `lib.sh`. Check
`which node` / `which pnpm` and edit the `export PATH=...` line in `lib.sh` if
they live somewhere not already listed.

## Sleep / off behaviour

- **Mac asleep** at the scheduled time → `launchd` coalesces the missed run and
  fires it **once on wake**. Self-healing.
- **Mac powered off** at the scheduled time → the run is **skipped** and not made
  up. The next scheduled run just catches up (backlog is checkpointed).

Because an off Mac is silent, monitoring uses an **external** dead-man's-switch so
the absence of a run is itself an alert.

## Monitoring

Set `HEALTHCHECK_URL` and `NTFY_TOPIC` per env (see `env.example`):

- Each job pings healthchecks.io on **start / success / fail**. healthchecks.io
  lives off the Mac, so if a ping is overdue (Mac off, job hung, crashed early)
  it alarms - route that to **ntfy** in its integrations UI for a phone push.
- On **failure**, the job also pushes to `ntfy.sh/<NTFY_TOPIC>` directly for an
  instant phone alert, plus a local macOS notification.

Subscribe to the ntfy topic in the ntfy phone app. Keep the topic name secret.

Every run also writes a **local record** under `data/musicbrainz/logs/`: a
per-job `<job>-<env>.status` (last run) and an appended `runs.jsonl` (history).
These work even with no healthcheck configured. Check health at a glance with:

```sh
scripts/cron-status.sh
```

It prints the last run of each job (flagging non-`ok` exits), which launchd jobs
are loaded, and recent run history.
