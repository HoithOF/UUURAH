import "server-only";
import type { LiveConnector, TokenSet } from "./types";
import type { MappedMoney } from "./stripe-map";
import { mapSquarePayment, mapSquareRefund, type SquarePayment, type SquareRefund } from "./square-map";

// Square OAuth (code flow). Access tokens last 30 days; the sync engine refreshes them.
// SQUARE_ENV=sandbox points everything at Square's sandbox for testing.

const host = () => (process.env.SQUARE_ENV === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com");
const VERSION = "2025-01-23";
const SCOPES = ["MERCHANT_PROFILE_READ", "PAYMENTS_READ"];

async function sq<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Square-Version": VERSION, "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${host()}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.detail ?? body?.message ?? `Square request failed (${res.status})`);
  return body as T;
}

function tokens(t: { access_token: string; refresh_token?: string; expires_at?: string }): TokenSet {
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: t.expires_at ? new Date(t.expires_at) : undefined };
}

async function pages<T>(path: string, key: string, token: string): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 200; i++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await sq<Record<string, unknown>>(`${path}${cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ""}`, { token });
    all.push(...((res[key] as T[]) ?? []));
    cursor = res.cursor as string | undefined;
    if (!cursor) break;
  }
  return all;
}

export const squareConnector: LiveConnector = {
  id: "square",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.SQUARE_APP_ID!, scope: SCOPES.join(" "), session: "false", state, redirect_uri: redirectUri });
    return `${host()}/oauth2/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await sq<{ access_token: string; refresh_token: string; expires_at: string; merchant_id: string }>("/oauth2/token", {
      method: "POST",
      body: JSON.stringify({ client_id: process.env.SQUARE_APP_ID, client_secret: process.env.SQUARE_APP_SECRET, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    const m = await sq<{ merchant?: { business_name?: string } }>(`/v2/merchants/${t.merchant_id}`, { token: t.access_token });
    return { externalAccountId: t.merchant_id, displayName: m.merchant?.business_name || "Square", scopes: SCOPES.join(" "), ...tokens(t) };
  },

  async refresh(refreshToken) {
    const t = await sq<{ access_token: string; refresh_token: string; expires_at: string }>("/oauth2/token", {
      method: "POST",
      body: JSON.stringify({ client_id: process.env.SQUARE_APP_ID, client_secret: process.env.SQUARE_APP_SECRET, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    return tokens(t);
  },

  async sync(_connection, since, { accessToken }) {
    if (!accessToken) throw new Error("Square sign-in is missing; reconnect Square.");
    const from = new Date(since ? since.getTime() - 864e5 : Date.now() - 365 * 864e5).toISOString();
    const locations = await sq<{ locations?: { id: string; name: string }[] }>("/v2/locations", { token: accessToken });
    const names = Object.fromEntries((locations.locations ?? []).map((l) => [l.id, l.name]));
    const payments = await pages<SquarePayment>(`/v2/payments?begin_time=${encodeURIComponent(from)}&limit=100`, "payments", accessToken);
    const refunds = await pages<SquareRefund>(`/v2/refunds?begin_time=${encodeURIComponent(from)}&limit=100`, "refunds", accessToken);
    const money: MappedMoney[] = [...payments.flatMap((p) => mapSquarePayment(p, names)), ...refunds.flatMap(mapSquareRefund)];
    return { money };
  },

  async disconnect(_connection, { accessToken }) {
    if (!accessToken) return;
    await fetch(`${host()}/oauth2/revoke`, {
      method: "POST",
      headers: { "Square-Version": VERSION, "Content-Type": "application/json", Authorization: `Client ${process.env.SQUARE_APP_SECRET}` },
      body: JSON.stringify({ client_id: process.env.SQUARE_APP_ID, access_token: accessToken }),
    });
  },
};
