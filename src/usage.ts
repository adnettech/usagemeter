import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { USAGE_URL, USER_AGENT, ANTHROPIC_BETA, CACHE_DIR, CACHE_FILE, ALLOW_REFRESH } from "./config.ts";
import { readCreds, refreshToken, tokenExpiring, AuthError } from "./creds.ts";
import type { Snapshot, UsageWindow, ExtraUsage } from "./types.ts";

const LABELS: Record<string, string> = {
  five_hour: "Current session",
  seven_day: "Weekly · All models",
  seven_day_opus: "Weekly · Opus only",
  seven_day_sonnet: "Weekly · Sonnet only",
  seven_day_cowork: "Weekly · Cowork",
  seven_day_oauth_apps: "Weekly · OAuth apps",
};

// Display order; anything not listed sorts after, in API order.
const ORDER = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"];

function titleize(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchRaw(token: string): Promise<any> {
  const res = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": ANTHROPIC_BETA,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401) throw new AuthError("access token expired — open Claude Code or run any 'claude' command to refresh");
  if (res.status === 429) throw new Error("429 rate limited — increase USAGEMETER_INTERVAL");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function normalize(raw: any, fetchedAt: number, plan: string | null): Snapshot {
  const present = Object.keys(raw)
    .filter((k) => k !== "extra_usage")
    .filter((k) => raw[k] && typeof raw[k] === "object" && raw[k].utilization != null);

  present.sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const windows: UsageWindow[] = present.map((k) => ({
    key: k,
    label: LABELS[k] ?? titleize(k),
    utilization: Number(raw[k].utilization) || 0,
    resetsAt: raw[k].resets_at,
    reltime: k === "five_hour",
  }));

  let extra: ExtraUsage = null;
  const e = raw.extra_usage;
  if (e?.is_enabled) {
    extra = {
      enabled: true,
      monthlyLimit: e.monthly_limit ?? null,
      usedCredits: e.used_credits ?? null,
      currency: e.currency ?? "USD",
    };
  }

  return { fetchedAt, plan, windows, extra, stale: false, error: null };
}

/**
 * Read credentials, fetch live usage, normalize. On any failure, fall back to the
 * last cached snapshot (marked stale) so the UI always has something to show.
 */
export async function getUsage(): Promise<Snapshot> {
  try {
    let creds = readCreds();
    if (ALLOW_REFRESH && tokenExpiring(creds)) {
      try {
        creds = await refreshToken(creds);
      } catch {
        // token may still be usable; let the fetch decide
      }
    }
    let raw: any;
    try {
      raw = await fetchRaw(creds.accessToken);
    } catch (e) {
      if (e instanceof AuthError && ALLOW_REFRESH) {
        creds = await refreshToken(creds);
        raw = await fetchRaw(creds.accessToken);
      } else {
        throw e;
      }
    }
    const snap = normalize(raw, Date.now(), creds.subscriptionType ?? null);
    saveCache(snap);
    return snap;
  } catch (e: any) {
    const cached = loadCache();
    const error = String(e?.message ?? e);
    if (cached) return { ...cached, stale: true, error };
    return { fetchedAt: Date.now(), plan: null, windows: [], extra: null, stale: true, error };
  }
}

function saveCache(s: Snapshot): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(s));
  } catch {
    // cache is best-effort
  }
}

function loadCache(): Snapshot | null {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}
