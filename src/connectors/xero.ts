import "server-only";
import type { LiveConnector, MappedInvoice, TokenSet } from "./types";
import type { MappedMoney } from "./stripe-map";
import { mapXeroBankTxn, mapXeroInvoice, mapXeroPayment, type XeroBankTxn, type XeroInvoice, type XeroPayment } from "./xero-map";

// Xero OAuth 2.0. Access tokens last 30 minutes; refresh tokens rotate.
// Xero moved new apps to granular scopes in 2026. XERO_SCOPES overrides the default
// if your app was created with the older broad scopes (accounting.transactions.read).

const AUTH = "https://login.xero.com/identity/connect/authorize";
const TOKEN = "https://identity.xero.com/connect/token";
const API = "https://api.xero.com/api.xro/2.0";
const DEFAULT_SCOPES = "offline_access accounting.invoices.read accounting.payments.read accounting.banktransactions.read accounting.settings.read";
const scopes = () => process.env.XERO_SCOPES || DEFAULT_SCOPES;
const basic = () => `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")}`;

async function tokenCall(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN, { method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description ?? t.error ?? `Xero sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

async function xero<T>(tenant: string, path: string, token: string, since: Date | null): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "xero-tenant-id": tenant, Accept: "application/json" };
  if (since) headers["If-Modified-Since"] = since.toUTCString();
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 429) throw new Error("Xero rate limit reached; will retry on the next sync.");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.Detail ?? body?.Message ?? `Xero request failed (${res.status})`);
  return body as T;
}

async function paged<T>(tenant: string, path: string, key: string, token: string, since: Date | null): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await xero<Record<string, T[]>>(tenant, `${path}${sep}page=${page}`, token, since);
    const rows = res[key] ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export const xeroConnector: LiveConnector = {
  id: "xero",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ response_type: "code", client_id: process.env.XERO_CLIENT_ID!, redirect_uri: redirectUri, scope: scopes(), state });
    return `${AUTH}?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const res = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${t.accessToken}` } });
    const tenants = (await res.json()) as { tenantId: string; tenantName: string; tenantType: string }[];
    const org = tenants.find((x) => x.tenantType === "ORGANISATION") ?? tenants[0];
    if (!org) throw new Error("No Xero organisation was shared.");
    return { externalAccountId: org.tenantId, displayName: org.tenantName, scopes: scopes(), ...t };
  },

  refresh(refreshToken) {
    return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async sync(connection, since, { accessToken }) {
    if (!accessToken) throw new Error("Xero sign-in is missing; reconnect Xero.");
    const tenant = connection.externalAccountId;
    const modified = since ? new Date(since.getTime() - 3600_000) : null;
    const from = since ? "" : `?where=${encodeURIComponent(`Date >= DateTime(${new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10).replace(/-/g, ",")})`)}`;

    const money: MappedMoney[] = [];
    for (const t of await paged<XeroBankTxn>(tenant, `/BankTransactions${from}`, "BankTransactions", accessToken, modified)) money.push(...mapXeroBankTxn(t));
    for (const p of await paged<XeroPayment>(tenant, `/Payments${from}`, "Payments", accessToken, modified)) money.push(...mapXeroPayment(p));
    const invoices: MappedInvoice[] = [];
    for (const i of await paged<XeroInvoice>(tenant, `/Invoices${from}`, "Invoices", accessToken, modified)) {
      const m = mapXeroInvoice(i);
      if (m) invoices.push(m);
    }
    return { money, invoices };
  },

  async disconnect(connection, { accessToken }) {
    if (!accessToken) return;
    const res = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${accessToken}` } });
    const list = (await res.json()) as { id: string; tenantId: string }[];
    const c = list.find((x) => x.tenantId === connection.externalAccountId);
    if (c) await fetch(`https://api.xero.com/connections/${c.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  },
};
