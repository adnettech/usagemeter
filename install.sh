#!/usr/bin/env bash
# usagemeter installer for Ubuntu / GNOME.
#
#   curl -fsSL https://raw.githubusercontent.com/tvinz/usagemeter/main/install.sh | bash
#
# or from a clone:  ./install.sh
#
# Env: USAGEMETER_DIR, USAGEMETER_REPO, USAGEMETER_NO_AUTOSTART=1, USAGEMETER_NO_START=1
set -euo pipefail

REPO_URL="${USAGEMETER_REPO:-https://github.com/tvinz/usagemeter.git}"
INSTALL_DIR="${USAGEMETER_DIR:-$HOME/.local/share/usagemeter}"

info() { printf '\033[1;34m==>\033[0m %s\n'   "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n'    "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Use an existing checkout if this script is run from one (avoids re-cloning).
FROM_CHECKOUT=0
if [ -n "${BASH_SOURCE:-}" ] && [ -f "${BASH_SOURCE[0]:-}" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SELF_DIR/package.json" ] && grep -q '"name": *"usagemeter"' "$SELF_DIR/package.json"; then
    INSTALL_DIR="$SELF_DIR"
    FROM_CHECKOUT=1
  fi
fi

# --- Bun ----------------------------------------------------------------------
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    info "Installing Bun…"
    curl -fsSL https://bun.sh/install | bash >/dev/null
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi
command -v bun >/dev/null 2>&1 || die "Bun not on PATH after install — open a new shell and re-run."
info "bun $(bun --version)"

# --- Source -------------------------------------------------------------------
if [ "$FROM_CHECKOUT" -eq 1 ]; then
  info "Using checkout: $INSTALL_DIR"
elif [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  command -v git >/dev/null 2>&1 || die "git is required — sudo apt install git"
  info "Cloning into $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

# --- Dependencies -------------------------------------------------------------
info "Installing dependencies…"
( cd "$INSTALL_DIR" && bun install --production )

# --- Tray runtime library (advice only — needs sudo) -------------------------
if command -v dpkg >/dev/null 2>&1 \
   && ! dpkg -s libayatana-appindicator3-1 >/dev/null 2>&1 \
   && ! dpkg -s libappindicator3-1 >/dev/null 2>&1; then
  warn "For the menu-bar icon, install AppIndicator support:"
  warn "    sudo apt install -y libayatana-appindicator3-1 gnome-shell-extension-appindicator"
fi

# --- Autostart ----------------------------------------------------------------
if [ "${USAGEMETER_NO_AUTOSTART:-0}" = "1" ]; then
  info "Skipping autostart (USAGEMETER_NO_AUTOSTART=1)"
else
  info "Installing autostart entry…"
  ( cd "$INSTALL_DIR" && bash install-autostart.sh )
fi

# --- GNOME Shell extension (top-bar UI) --------------------------------------
if [ "${USAGEMETER_NO_EXTENSION:-0}" = "1" ]; then
  info "Skipping GNOME extension (USAGEMETER_NO_EXTENSION=1)"
elif command -v gnome-extensions >/dev/null 2>&1; then
  info "Installing GNOME Shell extension (live panel display)…"
  ( cd "$INSTALL_DIR" && bash install-extension.sh ) || warn "extension install failed (non-fatal)"
  warn "Reload GNOME Shell to show the panel item — X11: Alt+F2, 'r', Enter; Wayland: re-login."
else
  info "No gnome-extensions CLI — skipping panel extension (use --tray for a systray icon)."
fi

# --- Launch -------------------------------------------------------------------
if [ "${USAGEMETER_NO_START:-0}" = "1" ]; then
  info "Not starting now (USAGEMETER_NO_START=1). Start with: $INSTALL_DIR/usagemeter.sh"
else
  info "Starting usagemeter…"
  nohup "$INSTALL_DIR/usagemeter.sh" >/dev/null 2>&1 &
fi

info "Done. Dashboard: http://localhost:7777  ·  tray icon in your top bar."
