import "server-only";
import type { LiveConnector, MappedAdDay } from "./types";
import { mapGoogleAdsRow, type GoogleAdsRow } from "./ads-map";
import { googleAuthorizeUrl, googleConfigured, googleExchange, googleRefresh, googleRevoke } from "@/lib/google-oauth";

// Google Ads API. Needs a Google Cloud OAuth client plus an approved Google Ads developer token.
// GOOGLE_ADS_API_VERSION lets you move to a newer API version without a code change.

const SCOPE = "https://www.googleapis.com/auth/adwords";
const base = () => `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION || "v22"}`;

function headers(token: string, loginCustomer?: string) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, "Content-Type": "application/json" };
  if (loginCustomer) h["login-customer-id"] = loginCustomer;
  return h;
}

async function search(token: string, customer: string, query: string, loginCustomer?: string): Promise<GoogleAdsRow[]> {
  const res = await fetch(`${base()}/customers/${customer}/googleAds:searchStream`, { method: "POST", headers: headers(token, loginCustomer), body: JSON.stringify({ query }) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = Array.isArray(body) ? body[0]?.error : body?.error;
    throw new Error(err?.details?.[0]?.errors?.[0]?.message ?? err?.message ?? `Google Ads request failed (${res.status})`);
  }
  return (body as { results?: GoogleAdsRow[] }[]).flatMap((chunk) => chunk.results ?? []);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const googleAdsConnector: LiveConnector = {
  id: "google-ads",
  connectVia: "redirect",

  isConfigured() {
    return googleConfigured() && Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  },

  authorizeUrl(state, redirectUri) {
    return googleAuthorizeUrl([SCOPE], state, redirectUri);
  },

  async exchangeCode(code, redirectUri) {
    const t = await googleExchange(code, redirectUri);
    const res = await fetch(`${base()}/customers:listAccessibleCustomers`, { headers: headers(t.accessToken) });
    const list = await res.json();
    if (!res.ok) throw new Error(list?.error?.message ?? "Couldn't list Google Ads accounts");
    const ids: string[] = (list.resourceNames ?? []).map((r: string) => r.split("/")[1]);
    // Use the first account that actually runs ads (not a manager account).
    for (const id of ids) {
      const [row] = (await search(t.accessToken, id, "SELECT customer.descriptive_name, customer.manager FROM customer LIMIT 1").catch(() => [])) as (GoogleAdsRow & { customer?: { descriptiveName?: string; manager?: boolean } })[];
      if (row && !row.customer?.manager) return { externalAccountId: id, displayName: row.customer?.descriptiveName || `Google Ads ${id}`, scopes: SCOPE, ...t };
    }
    throw new Error("No Google Ads account with campaigns was found for that Google login.");
  },

  refresh: googleRefresh,

  async sync(connection, since, { accessToken }) {
    if (!accessToken) throw new Error("Google sign-in is missing; reconnect Google Ads.");
    // Ad platforms revise recent days (late conversions), so always re-read the last week.
    const from = new Date(since ? Math.min(since.getTime(), Date.now()) - 7 * 864e5 : Date.now() - 90 * 864e5);
    const q = `SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, customer.currency_code FROM campaign WHERE segments.date BETWEEN '${ymd(from)}' AND '${ymd(new Date())}'`;
    const rows = await search(accessToken, connection.externalAccountId, q);
    const ads = rows.map(mapGoogleAdsRow).filter((x): x is MappedAdDay => x !== null);
    return { money: [], ads };
  },

  async disconnect(_c, { accessToken }) {
    if (accessToken) await googleRevoke(accessToken);
  },
};
