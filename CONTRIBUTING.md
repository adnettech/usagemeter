# Contributing to usagemeter

Thanks for helping out! A few conventions.

## Dev setup
- Install [Bun](https://bun.sh), then `bun install`.
- `bun run once` — prints your current usage (needs a logged-in Claude Code).
- `bun start` — runs the backend (dashboard at http://localhost:7777). The GNOME panel UI
  is the extension under `gnome-extension/` (see the README → Install section).

## Workflow (`main` is protected)
- Branch off `main`, push, and open a PR.
- CI (`check`) must pass: it runs `bun build` plus shell and extension syntax checks.
- Merges are **squash-only**; the source branch is auto-deleted after merge.
- Direct pushes to `main` are reserved for maintainers — please use a PR otherwise.

## Touching the GNOME extension
GNOME caches extension code, so after changing anything under `gnome-extension/`, **reload
the Shell (log out/in)** to test. Don't run `gnome-shell --replace` on a VM/remote display —
it can crash the session.

## Maintainers — scaling to a team
Solo today, so branch protection requires a PR + green CI but **0 approvals** (so you can
self-merge). **When a second maintainer joins:** set *Required approving reviews* to **1**
and turn on *Require review from Code Owners* — the mechanism is already in place, it's just
one toggle.
