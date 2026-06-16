import SysTray from "systray2";
import { chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { Snapshot } from "./types.ts";
import { meterIconBase64 } from "./icon.ts";
import { pct, fmtRelative, fmtAbsolute, fmtAgo } from "./format.ts";

type Handlers = {
  onRefresh: () => void;
  onOpen: () => void;
  onQuit: () => void;
};

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

const SEP = { title: "────────────", enabled: false };
const REFRESH = "↻ Refresh now";
const OPEN = "⧉ Open dashboard";
const QUIT = "Quit";
const MAX_LINES = 8; // fixed slots for usage windows (hidden when unused)

export class Tray {
  private systray: any = null;
  private handlers: Handlers;

  // Stable item objects. systray2 assigns each a __id at init and tracks updates by it,
  // so we must mutate THESE objects (never rebuild) and push them via `update-item`.
  private menu: any = null;
  private lineItems: any[] = [];
  private extraItem: any = null;
  private updatedItem: any = null;

  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }

  /** Recompute item titles/visibility and the icon from a snapshot, mutating in place. */
  private apply(s: Snapshot): void {
    const lines: string[] = [];
    if (s.windows.length === 0) {
      lines.push(s.error ? `⚠ ${s.error}` : "No data yet…");
    } else {
      for (const w of s.windows) {
        const reset = w.reltime ? `resets ${fmtRelative(w.resetsAt)}` : `resets ${fmtAbsolute(w.resetsAt)}`;
        lines.push(`${w.label}:  ${pct(w.utilization)}%   ·   ${reset}`);
      }
    }
    this.lineItems.forEach((it, i) => {
      if (i < lines.length) {
        it.title = lines[i];
        it.hidden = false;
      } else {
        it.title = "";
        it.hidden = true;
      }
    });

    if (s.extra?.enabled) {
      const used = (s.extra.usedCredits ?? 0).toFixed(2);
      this.extraItem.title = `Extra usage:  ${s.extra.currency} ${used} / ${s.extra.monthlyLimit ?? "—"}`;
      this.extraItem.hidden = false;
    } else {
      this.extraItem.title = "";
      this.extraItem.hidden = true;
    }

    this.updatedItem.title = `Updated ${fmtAgo(s.fetchedAt)}${s.stale ? "  (stale)" : ""}`;
  }

  async start(initial: Snapshot): Promise<void> {
    ensureHelperExecutable();

    this.lineItems = Array.from({ length: MAX_LINES }, () => ({ title: "", enabled: false, hidden: true }));
    this.extraItem = { title: "", enabled: false, hidden: true };
    this.updatedItem = { title: "", enabled: false };

    this.menu = {
      icon: meterIconBase64(),
      isTemplateIcon: false,
      title: "",
      tooltip: "Claude usage",
      items: [
        ...this.lineItems,
        this.extraItem,
        { ...SEP },
        this.updatedItem,
        { title: REFRESH, enabled: true },
        { title: OPEN, enabled: true },
        { ...SEP },
        { title: QUIT, enabled: true },
      ],
    };
    this.apply(initial);

    this.systray = new SysTray({ menu: this.menu, debug: false, copyDir: false });
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
    this.apply(s);
    // Only `update-item` re-renders on GNOME/appindicator (update-menu is a no-op here).
    for (const it of [...this.lineItems, this.extraItem, this.updatedItem]) {
      this.systray.sendAction({ type: "update-item", item: it, seq_id: -1 }).catch(() => {});
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
