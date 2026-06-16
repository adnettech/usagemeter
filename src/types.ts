export type UsageWindow = {
  /** raw API key, e.g. "five_hour" */
  key: string;
  /** human label, e.g. "Current session" */
  label: string;
  /** 0..100 */
  utilization: number;
  /** ISO 8601 reset timestamp */
  resetsAt: string;
  /** true => show a live relative countdown ("in 3 hr 22 min"); false => absolute ("Fri 6:59 PM") */
  reltime: boolean;
};

export type ExtraUsage = {
  enabled: boolean;
  monthlyLimit: number | null;
  usedCredits: number | null;
  currency: string;
} | null;

export type Snapshot = {
  /** epoch ms when this data was fetched (0 = never) */
  fetchedAt: number;
  /** subscription type from credentials, e.g. "Team" */
  plan: string | null;
  windows: UsageWindow[];
  extra: ExtraUsage;
  /** true if served from cache because the live fetch failed */
  stale: boolean;
  /** last error message, if any */
  error: string | null;
};
