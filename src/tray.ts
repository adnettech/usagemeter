import SysTray from "systray2";
import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { Snapshot } from "./types.ts";
import { gaugeIconBase64 } from "./icon.ts";
import { pct, fmtRelative, fmtAbsolute, fmtAgo } from "./format.ts";

// systray2 ships its Go helper without the execute bit, and Bun's file copy does not
// restore it — so spawning fails with EACCES. Mark the in-package binary executable
// and run it in place (copyDir: false) so the mode is guaranteed.
function ensureHelperExecutable(): void {
  try {
    const req = createRequire(import.meta.url);
    const binName =
      process.platform === "win32"
        ? "tray_windows_release.exe"
        : process.platform === "darwin"
          ? "tray_darwin_release"
          : "tray_linux_release";
    const binPath = join(dirname(req.resolve("systray2")), "traybin", binName);
    chmodSync(binPath, 0o755);
  } catch {
    // best effort — systray2 will surface a clearer error if this genuinely fails
  }
}

type Handlers = {
  onRefresh: () => void;
  onOpen: () => void;
  onQuit: () => void;
};

const SEP = { title: "────────────", enabled: false };

// Stable titles used to dispatch clicks (disabled items never fire onClick).
const REFRESH = "↻ Refresh now";
const OPEN = "⧉ Open dashboard";
const QUIT = "Quit";

export class Tray {
  private systray: any = null;
  private handlers: Handlers;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  private menuFor(s: Snapshot) {
    const items: any[] = [];

    if (s.windows.length === 0) {
      items.push({ title: s.error ? `⚠ ${s.error}` : "No data yet…", enabled: false });
    } else {
      for (const w of s.windows) {
        const reset = w.reltime ? `resets ${fmtRelative(w.resetsAt)}` : `resets ${fmtAbsolute(w.resetsAt)}`;
        items.push({ title: `${w.label}:  ${pct(w.utilization)}%   ·   ${reset}`, enabled: false });
      }
    }

    if (s.extra?.enabled) {
      const used = (s.extra.usedCredits ?? 0).toFixed(2);
      const limit = s.extra.monthlyLimit ?? "—";
      items.push({ title: `Extra usage:  ${s.extra.currency} ${used} / ${limit}`, enabled: false });
    }

    items.push(SEP);
    items.push({ title: `Updated ${fmtAgo(s.fetchedAt)}${s.stale ? "  (stale)" : ""}`, enabled: false });
    items.push({ title: REFRESH, enabled: true });
    items.push({ title: OPEN, enabled: true });
    items.push(SEP);
    items.push({ title: QUIT, enabled: true });

    const maxUtil = s.windows.reduce((m, w) => Math.max(m, w.utilization), 0);
    const session = s.windows.find((w) => w.key === "five_hour");
    return {
      icon: gaugeIconBase64(maxUtil),
      isTemplateIcon: false,
      title: "",
      tooltip: `Claude usage — session ${pct(session?.utilization ?? 0)}%`,
      items,
    };
  }

  async start(initial: Snapshot): Promise<void> {
    ensureHelperExecutable();
    this.systray = new SysTray({ menu: this.menuFor(initial), debug: false, copyDir: false });
    this.systray.onClick((action: any) => {
      const title: string = action?.item?.title ?? "";
      if (title === REFRESH) this.handlers.onRefresh();
      else if (title === OPEN) this.handlers.onOpen();
      else if (title === QUIT) this.handlers.onQuit();
    });
    await this.systray.ready();
  }

  update(s: Snapshot): void {
    if (!this.systray) return;
    try {
      this.systray.sendAction({ type: "update-menu", menu: this.menuFor(s) });
    } catch {
      // tray update is best-effort
    }
  }

  kill(): void {
    try {
      this.systray?.kill(false);
    } catch {
      // ignore
    }
  }
}
