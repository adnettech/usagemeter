#!/usr/bin/env bash
# Install a GNOME autostart entry that launches usagemeter on login, pointing at
# wherever this repository is checked out.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
mkdir -p "$DEST"

cat > "$DEST/usagemeter.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=usagemeter
Comment=Claude subscription usage meter (tray + dashboard)
Exec=$DIR/usagemeter.sh
Path=$DIR
Terminal=false
X-GNOME-Autostart-enabled=true
X-GNOME-Autostart-Delay=5
EOF

chmod +x "$DIR/usagemeter.sh"
echo "Installed autostart entry -> $DEST/usagemeter.desktop"
echo "Launches: $DIR/usagemeter.sh (logs to \${XDG_CACHE_HOME:-\$HOME/.cache}/usagemeter/usagemeter.log)"
echo "Remove it with: rm \"$DEST/usagemeter.desktop\""
