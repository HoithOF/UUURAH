import "server-only";
import type { LiveConnector, MappedInvoice, TokenSet } from "./types";
import type { MappedMoney } from "./stripe-map";
import { mapQbInvoice, mapQbMoney, type QbTxn } from "./quickbooks-map";

// QuickBooks Online via Intuit OAuth 2.0. Access tokens last 1 hour, refresh tokens
// rotate on every refresh. QUICKBOOKS_ENV=sandbox uses Intuit's sandbox companies.

const AUTH = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const api = () => (process.env.QUICKBOOKS_ENV === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");
const MINOR = "75";

const basic = () => `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString("base64")}`;

async function tokenCall(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(TOKEN, { method: "POST", headers: { Authorization: basic(), Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description ?? t.error ?? `QuickBooks sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

async function qb<T>(realm: string, path: string, token: string): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${api()}/v3/company/${realm}${path}${sep}minorversion=${MINOR}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.Fault?.Error?.[0]?.Detail ?? `QuickBooks request failed (${res.status})`);
  return body as T;
}

async function queryAll(realm: string, entity: string, where: string, token: string): Promise<QbTxn[]> {
  const out: QbTxn[] = [];
  for (let start = 1; start < 100_000; start += 1000) {
    const q = `select * from ${entity}${where} startposition ${start} maxresults 1000`;
    const res = await qb<{ QueryResponse: Record<string, QbTxn[]> }>(realm, `/query?query=${encodeURIComponent(q)}`, token);
    const rows = res.QueryResponse?.[entity] ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export const quickbooksConnector: LiveConnector = {
  id: "quickbooks",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.QUICKBOOKS_CLIENT_ID!, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: redirectUri, state });
    return `${AUTH}?${p}`;
  },

  async exchangeCode(code, redirectUri, params) {
    const realm = params.get("realmId");
    if (!realm) throw new Error("QuickBooks did not say which company was connected.");
    const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const info = await qb<{ CompanyInfo?: { CompanyName?: string } }>(realm, `/companyinfo/${realm}`, t.accessToken);
    return { externalAccountId: realm, displayName: info.CompanyInfo?.CompanyName ?? "QuickBooks", scopes: "com.intuit.quickbooks.accounting", ...t };
  },

  refresh(refreshToken) {
    return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async sync(connection, since, { accessToken }) {
    if (!accessToken) throw new Error("QuickBooks sign-in is missing; reconnect QuickBooks.");
    const realm = connection.externalAccountId;
    const prefs = await qb<{ Preferences?: { CurrencyPrefs?: { HomeCurrency?: { value?: string } } } }>(realm, "/preferences", accessToken);
    const home = prefs.Preferences?.CurrencyPrefs?.HomeCurrency?.value ?? "USD";
    // First sync: a year of history. Later syncs: anything changed since the last one.
    const where = since
      ? ` where MetaData.LastUpdatedTime >= '${new Date(since.getTime() - 3600_000).toISOString()}'`
      : ` where TxnDate >= '${new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)}'`;

    const money: MappedMoney[] = [];
    for (const e of ["Payment", "SalesReceipt", "RefundReceipt", "Purchase", "BillPayment"] as const)
      for (const t of await queryAll(realm, e, where, accessToken)) money.push(...mapQbMoney(e, t, home));
    const invoices: MappedInvoice[] = [];
    for (const e of ["Invoice", "Bill"] as const)
      for (const t of await queryAll(realm, e, where, accessToken)) invoices.push(mapQbInvoice(e, t, home));
    return { money, invoices };
  },

  async disconnect(_connection, { accessToken }) {
    if (!accessToken) return;
    await fetch(REVOKE, { method: "POST", headers: { Authorization: basic(), Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ token: accessToken }) });
  },
};
