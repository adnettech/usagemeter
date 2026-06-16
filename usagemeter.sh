#!/usr/bin/env bash
# usagemeter launcher — used by the GNOME autostart entry and for manual background runs.
# Uses an absolute bun path because the login session's PATH may not include ~/.bun/bin.
set -euo pipefail

BUN="${BUN:-$(command -v bun 2>/dev/null || echo "$HOME/.bun/bin/bun")}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/usagemeter"

mkdir -p "$LOG_DIR"
cd "$DIR"
exec "$BUN" src/index.ts "$@" >> "$LOG_DIR/usagemeter.log" 2>&1
