# Contributing

## Branches and environments

Three long-lived branches map to the three environments:

- **`dev`** — the default branch. Feature branches open PRs here; merging deploys
  the dev environment.
- **`staging`** — promote `dev` here (fast-forward) to deploy staging.
- **`production`** — promote `staging` here to deploy production (gated on
  approval).

Promote with fast-forward merges so commit history carries through cleanly:

```bash
git checkout staging && git merge --ff-only dev && git push
git checkout production && git merge --ff-only staging && git push
```

## Commits

Use [conventional commits](https://www.conventionalcommits.org) — `feat:`,
`fix:`, `chore:`, `docs:`, `refactor:`, `test:`, etc. release-please reads them
to generate the changelog and pick the next semver version when changes reach
`production`. Use `feat!:` or a `BREAKING CHANGE:` footer for breaking changes.

## Before opening a PR

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```
