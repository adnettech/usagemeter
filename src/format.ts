export function pct(n: number): number {
  return Math.round(n);
}

/** "in 3 hr 22 min" / "in 22 min" / "resetting…" */
export function fmtRelative(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "resetting now";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `in ${h} hr ${m} min`;
  return `in ${m} min`;
}

/** "Fri 6:59 PM" in the system locale/timezone */
export function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** "just now" / "45 sec ago" / "3 min ago" / "2 hr ago" */
export function fmtAgo(ms: number, now = Date.now()): string {
  if (!ms) return "never";
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} hr ago`;
}
