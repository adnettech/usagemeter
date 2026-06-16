#!/usr/bin/env bash
# Install + enable the usagemeter GNOME Shell extension from this checkout.
set -euo pipefail

UUID="usagemeter@tvinz.github.io"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gnome-extension/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

[ -d "$SRC" ] || { echo "error: $SRC not found" >&2; exit 1; }

mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
[ -d "$DEST/schemas" ] && command -v glib-compile-schemas >/dev/null && glib-compile-schemas "$DEST/schemas" || true

# User extensions must be allowed globally, or nothing in ~/.local/share loads.
if command -v gsettings >/dev/null 2>&1 \
   && [ "$(gsettings get org.gnome.shell disable-user-extensions 2>/dev/null)" = "true" ]; then
  gsettings set org.gnome.shell disable-user-extensions false \
    && echo "Enabled user extensions globally (org.gnome.shell disable-user-extensions was true)."
fi

if command -v gnome-extensions >/dev/null 2>&1; then
  gnome-extensions enable "$UUID" 2>/dev/null || true
fi

echo "Installed extension -> $DEST"
echo
echo "Reload GNOME Shell so it loads:"
echo "  • X11:     press Alt+F2, type 'r', press Enter"
echo "  • Wayland: log out and back in"
echo "Then it appears in the top bar (make sure the backend is running: usagemeter.sh)."
echo "Status:  gnome-extensions info $UUID"
