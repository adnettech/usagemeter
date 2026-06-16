import { parseArgs, POLL_INTERVAL_MS } from "./config.ts";
import { getUsage } from "./usage.ts";
import { startDashboard } from "./dashboard.ts";
import { Tray } from "./tray.ts";
import type { Snapshot } from "./types.ts";
import { pct, fmtRelative, fmtAbsolute, fmtAgo } from "./format.ts";

const args = parseArgs(Bun.argv.slice(2));

let latest: Snapshot = { fetchedAt: 0, plan: null, windows: [], extra: null, stale: true, error: "starting" };

function printSummary(s: Snapshot): void {
  if (s.error && s.windows.length === 0) {
    console.error("usagemeter: " + s.error);
    return;
  }
  console.log(`Claude usage${s.plan ? ` (${s.plan})` : ""}${s.stale ? "  [stale cache]" : ""}`);
  for (const w of s.windows) {
    const reset = w.reltime ? fmtRelative(w.resetsAt) : fmtAbsolute(w.resetsAt);
    console.log(`  ${w.label.padEnd(24)} ${String(pct(w.utilization)).padStart(3)}%   resets ${reset}`);
  }
  if (s.extra?.enabled) {
    console.log(`  ${"Extra usage".padEnd(24)} ${s.extra.currency} ${(s.extra.usedCredits ?? 0).toFixed(2)} / ${s.extra.monthlyLimit ?? "—"}`);
  }
  console.log(`  updated ${fmtAgo(s.fetchedAt)}`);
}

function openUrl(url: string): void {
  if (!url) return;
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" });
  } catch {
    // best effort
  }
}

async function main(): Promise<void> {
  latest = await getUsage();

  if (args.once) {
    printSummary(latest);
    process.exit(latest.error && latest.windows.length === 0 ? 1 : 0);
  }

  // Long-running daemon: never let a transient tray/child-process error kill monitoring.
  process.on("unhandledRejection", (e) => console.error("usagemeter unhandledRejection:", String(e)));
  process.on("uncaughtException", (e: any) => console.error("usagemeter uncaughtException:", String(e?.message ?? e)));

  let tray: Tray | null = null;

  let dash: { url: string; stop: () => void } | null = null;
  if (args.dashboard) {
    dash = startDashboard({
      port: args.port,
      getSnapshot: () => latest,
      refresh: async () => {
        latest = await getUsage();
        tray?.update(latest);
        return latest;
      },
    });
    console.log(`Dashboard:  ${dash.url}`);
  }

  if (args.tray) {
    tray = new Tray({
      onRefresh: async () => {
        latest = await getUsage();
        tray?.update(latest);
      },
      onOpen: () => openUrl(dash?.url ?? ""),
      onQuit: () => {
        tray?.kill();
        process.exit(0);
      },
    });
    try {
      await tray.start(latest);
      console.log("Tray:       running (menu-bar icon active)");
    } catch (e) {
      console.error("Tray:       failed to start —", String(e));
      console.error("            (dashboard still works; see README troubleshooting)");
      tray = null;
    }
  }

  printSummary(latest);

  const intervalMs = args.interval ? Math.max(60, args.interval) * 1000 : POLL_INTERVAL_MS;
  const timer = setInterval(async () => {
    latest = await getUsage();
    tray?.update(latest);
  }, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    tray?.kill();
    dash?.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (args.open) openUrl(dash?.url ?? "");
}

main();
