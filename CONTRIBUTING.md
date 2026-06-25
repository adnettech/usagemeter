# Contributing to usagemeter

Thanks for helping out! A few conventions.

## Dev setup
- Install [Bun](https://bun.sh), then `bun install`.
- `bun run once` — prints your current usage (needs a logged-in Claude Code).
- `bun start` — runs the backend (dashboard at http://localhost:7777). The GNOME panel UI
  is the extension under `gnome-extension/` (see the README → Install section).

## Workflow (`main` is protected)

**Always work off a branch and a PR — including your own changes.** There's no separate
"local vs. git" mode: you edit locally, then ship through a branch and a pull request. Don't
commit straight to `main`. `main` is a protected branch — CI must pass to merge, and
force-pushes and deletion are blocked.

```bash
git switch -c my-change           # 1. branch off main
# ...edit files...
git commit -am "Describe the change"
git push -u origin my-change      # 2. push your branch
gh pr create --fill               # 3. open a PR (or use the GitHub web UI)
# CI runs on the PR. Once the 'check' run is green:
gh pr merge --squash --delete-branch
git switch main && git pull       # 4. sync your local main
```

- CI (`check`) must pass: it runs `bun build` plus shell and extension syntax checks.
- Merges are **squash-only**; the source branch is auto-deleted after merge.
- Protection currently requires green CI but **0 approvals**, so a solo maintainer can
  self-merge. Repo admins *can* technically bypass the rules in an emergency — treat that as
  break-glass, not your routine.

## Touching the GNOME extension
GNOME caches extension code, so after changing anything under `gnome-extension/`, **reload
the Shell (log out/in)** to test. Don't run `gnome-shell --replace` on a VM/remote display —
it can crash the session.

## Maintainers — scaling to a team
Solo today, so branch protection requires a PR + green CI but **0 approvals** (so you can
self-merge). **When a second maintainer joins:** set *Required approving reviews* to **1**
and turn on *Require review from Code Owners* — the mechanism is already in place, it's just
one toggle.
