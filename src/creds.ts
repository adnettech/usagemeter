import { readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs";
import { CRED_PATH, OAUTH_CLIENT_ID, OAUTH_TOKEN_URL } from "./config.ts";

export type Creds = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  subscriptionType?: string;
};

export class AuthError extends Error {}

export function readCreds(): Creds {
  let txt: string;
  try {
    txt = readFileSync(CRED_PATH, "utf8");
  } catch {
    throw new AuthError(`Cannot read ${CRED_PATH} — is Claude Code logged in?`);
  }
  let o: any;
  try {
    o = JSON.parse(txt)?.claudeAiOauth;
  } catch {
    throw new AuthError("Credentials file is not valid JSON.");
  }
  if (!o?.accessToken) throw new AuthError("No claudeAiOauth.accessToken in credentials file.");
  return {
    accessToken: o.accessToken,
    refreshToken: o.refreshToken,
    expiresAt: o.expiresAt ?? 0,
    subscriptionType: o.subscriptionType,
  };
}

/** True if the token is missing an expiry or expires within `skewMs`. */
export function tokenExpiring(c: Creds, skewMs = 120_000): boolean {
  return !c.expiresAt || c.expiresAt - Date.now() < skewMs;
}

/**
 * Exchange the refresh token for a fresh access token and persist it back to the
 * credentials file. DISABLED by default (gated behind ALLOW_REFRESH): refresh tokens
 * are single-use, so refreshing independently of Claude Code can invalidate each
 * other's token and log you out. Only enable if you accept that trade-off.
 */
export async function refreshToken(c: Creds): Promise<Creds> {
  if (!c.refreshToken) throw new AuthError("No refresh token available.");
  let res: Response;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: c.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });
  } catch (e) {
    throw new AuthError(`Token refresh request failed: ${String(e)}`);
  }
  if (!res.ok) {
    throw new AuthError(`Token refresh failed (HTTP ${res.status}). Run any 'claude' command to re-auth.`);
  }
  const j: any = await res.json();
  if (!j.access_token) throw new AuthError("Token refresh response had no access_token.");
  const updated: Creds = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? c.refreshToken,
    expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    subscriptionType: c.subscriptionType,
  };
  writeBack(updated);
  return updated;
}

function writeBack(c: Creds): void {
  let root: any = {};
  try {
    root = JSON.parse(readFileSync(CRED_PATH, "utf8"));
  } catch {
    // start fresh if unreadable
  }
  root.claudeAiOauth = {
    ...(root.claudeAiOauth || {}),
    accessToken: c.accessToken,
    refreshToken: c.refreshToken,
    expiresAt: c.expiresAt,
  };
  const tmp = `${CRED_PATH}.usagemeter.tmp`;
  writeFileSync(tmp, JSON.stringify(root), { mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    // best effort
  }
  renameSync(tmp, CRED_PATH);
}
