import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";

export const HOME = homedir();
export const CRED_PATH = join(HOME, ".claude", ".credentials.json");
export const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(HOME, ".cache"), "usagemeter");
export const CACHE_FILE = join(CACHE_DIR, "last.json");

function cmpVer(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function detectVersion(): string {
  try {
    const dirs = readdirSync(join(HOME, ".local/share/claude/versions"));
    const vers = dirs.filter((d) => /^\d+\.\d+\.\d+/.test(d)).sort(cmpVer);
    if (vers.length) return vers[vers.length - 1];
  } catch {
    // ignore
  }
  return "2.1.178";
}

export const CLAUDE_VERSION = detectVersion();

// The /api/oauth/usage endpoint hard rate-limits requests whose User-Agent does not
// look like the official client. This app acts on behalf of the same subscription, so
// it identifies as claude-code/<version>. Override with USAGEMETER_UA if you prefer.
export const USER_AGENT = process.env.USAGEMETER_UA ?? `claude-code/${CLAUDE_VERSION}`;

export const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const ANTHROPIC_BETA = "oauth-2025-04-20";

// Best-effort OAuth refresh fallback. Claude Code normally keeps the credentials file
// fresh on its own, so this path is rarely exercised. The client_id is the public
// (PKCE) Claude Code OAuth client; override both via env if Anthropic changes them.
export const OAUTH_CLIENT_ID = process.env.USAGEMETER_CLIENT_ID ?? "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const OAUTH_TOKEN_URL = process.env.USAGEMETER_TOKEN_URL ?? "https://console.anthropic.com/v1/oauth/token";

function intEnv(name: string, def: number, min: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.floor(v) : def;
}

/** Poll interval. Default 120s; clamped to >=60s to stay friendly to the endpoint. */
export const POLL_INTERVAL_MS = intEnv("USAGEMETER_INTERVAL", 120, 60) * 1000;
export const PORT = intEnv("USAGEMETER_PORT", 7777, 1);

// Off by default. usagemeter stays read-only on the credentials file so it can never
// fight Claude Code over the (single-use) refresh token and accidentally log you out.
// Set USAGEMETER_ALLOW_REFRESH=1 to let it refresh and write the token back itself.
export const ALLOW_REFRESH = process.env.USAGEMETER_ALLOW_REFRESH === "1";

export type Args = { once: boolean; tray: boolean; dashboard: boolean; open: boolean; port?: number; interval?: number };

export function parseArgs(argv: string[]): Args {
  const has = (f: string) => argv.includes(f);
  const num = (f: string) => {
    const i = argv.indexOf(f);
    if (i >= 0 && argv[i + 1] !== undefined) {
      const v = Number(argv[i + 1]);
      if (Number.isFinite(v)) return v;
    }
    return undefined;
  };
  return {
    once: has("--once"),
    // Tray is opt-in: on GNOME the Shell extension is the panel UI. Use --tray for the
    // systray2 icon (e.g. on non-GNOME desktops).
    tray: has("--tray"),
    dashboard: !has("--no-dashboard"),
    open: has("--open"),
    port: num("--port"),
    interval: num("--interval"),
  };
}
