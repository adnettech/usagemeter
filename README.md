# usagemeter

A local menu-bar meter for your **Claude subscription** usage — the same numbers the
Claude desktop app shows under Settings → Usage, in your system tray and a small
localhost dashboard.

It shows:

- **Current session** — your 5-hour rolling window (% used + live "resets in …" countdown)
- **Weekly · All models** — % used + reset time
- **Weekly · Sonnet only** — % used + reset time
- **Last updated** — when the numbers were last fetched
- *(bonus)* extra-usage credit pool, and any other limit buckets your plan exposes

## How it works

Claude Code stores your subscription's OAuth token in `~/.claude/.credentials.json`.
usagemeter reads that token and calls the same endpoint the desktop app / `/usage`
command uses:

```
GET https://api.anthropic.com/api/oauth/usage
Authorization: Bearer <accessToken>
anthropic-beta: oauth-2025-04-20
User-Agent: claude-code/<version>
```

The response (`five_hour`, `seven_day`, `seven_day_sonnet`, …) is normalized and shown.
Nothing leaves your machine except that one request to `api.anthropic.com` — the same
call your desktop app already makes. The last good result is cached to
`~/.cache/usagemeter/last.json` so the UI still shows something if a fetch fails.

> **Note:** This reuses *your own* credentials for *your own* account, read-only, locally.
> The token is read in place and never copied elsewhere. By default usagemeter **never
> writes** the credentials file — it only reads the latest access token Claude Code
> stores, so it cannot interfere with your Claude Code login. See **Authentication** below.

## Authentication

usagemeter has no login of its own — it rides on Claude Code's. Each poll it re-reads
`~/.claude/.credentials.json` and uses the current `accessToken`. Claude Code refreshes
that token as you use it, so usagemeter always picks up a fresh one automatically. The
repository ships with **no credentials** — each user authenticates with their own local
Claude Code login.

Because OAuth refresh tokens are **single-use** (they rotate on each refresh), two clients
sharing one token can invalidate each other — so by default usagemeter is **read-only** and
never refreshes. If the token expires while you're away from Claude (e.g. overnight), the
meter shows the last figures marked *stale* and recovers automatically the next time you use
Claude Code. To let usagemeter refresh the token itself (and write it back), set
`USAGEMETER_ALLOW_REFRESH=1` — only if you accept the rotation risk above.

## Requirements

- [Bun](https://bun.sh) (tested on 1.3)
- A logged-in Claude Code (so `~/.claude/.credentials.json` exists)
- For the tray: any StatusNotifierItem host. On GNOME that's the
  **AppIndicator and KStatusNotifierItem Support** extension (already enabled on Ubuntu).
  systray2 also supports macOS and Windows.

## Run

```bash
bun install
bun start            # tray + dashboard (default)
bun run dashboard    # dashboard only, no tray
bun run once         # print current usage to the terminal and exit
```

Then open the dashboard at **http://localhost:7777**.

### Flags & env

| Flag | Env | Default | Meaning |
|---|---|---|---|
| `--port N` | `USAGEMETER_PORT` | `7777` | dashboard port |
| `--interval N` | `USAGEMETER_INTERVAL` | `120` | poll seconds (min 60) |
| `--no-tray` | | | disable the tray |
| `--no-dashboard` | | | disable the web server |
| `--once` | | | fetch once, print, exit |
| `--open` | | | open the dashboard in your browser on start |
| | `USAGEMETER_UA` | `claude-code/<ver>` | request User-Agent |
| | `USAGEMETER_ALLOW_REFRESH` | `0` | let usagemeter refresh the token itself (see Authentication) |
| | `USAGEMETER_TOKEN_URL` / `USAGEMETER_CLIENT_ID` | | OAuth refresh fallback overrides |

### Single binary (optional)

```bash
bun run compile      # -> ./usagemeter
```

The compiled binary runs the CLI/dashboard standalone. The **tray** still needs the
systray2 helper from `node_modules/systray2/traybin`, so for the tray either run via
`bun` or keep `node_modules` alongside the binary.

### Start on login (GNOME)

Run `./install-autostart.sh` to launch usagemeter with your GNOME session (tray +
dashboard). It writes `~/.config/autostart/usagemeter.desktop` pointing at this checkout.
Logs go to `~/.cache/usagemeter/usagemeter.log`.

- Run manually: `bun start` (foreground), or `./usagemeter.sh &` to background with logging.
- Disable autostart: remove `~/.config/autostart/usagemeter.desktop`, or toggle it off in
  GNOME *Tweaks → Startup Applications*.

## Troubleshooting

- **Tray icon not visible** — you need a tray/appindicator host. On GNOME enable the
  *AppIndicator* extension and log out/in.
- **`429 rate limited`** — raise the interval: `bun start --interval 300`.
- **Auth error / can't read credentials** — run any `claude` command to (re)log in;
  usagemeter reuses Claude Code's token.
- **`EACCES … tray_..._release`** — handled automatically (the helper is chmod'd on
  start), but if it recurs, `chmod +x node_modules/systray2/traybin/tray_linux_release`.

## What it does *not* show

The desktop app's "Daily included routine runs" line is **not** returned by
`/api/oauth/usage`, so it is intentionally omitted rather than faked.

## License

MIT — see [LICENSE](LICENSE).
