import "server-only";
import type { LiveConnector, MappedAdDay } from "./types";
import { mapMetaInsight, type MetaInsightRow } from "./ads-map";

// Meta (Facebook and Instagram) ads through the Marketing API. Meta has no refresh tokens:
// we swap the sign-in for a 60-day token, and the owner reconnects when it runs out.

const VERSION = () => process.env.META_API_VERSION || "v23.0";
const graph = () => `https://graph.facebook.com/${VERSION()}`;
const SCOPE = "ads_read";

async function g<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = path.startsWith("http") ? path : `${graph()}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Meta request failed (${res.status})`);
  return body as T;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export const metaAdsConnector: LiveConnector = {
  id: "meta-ads",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.META_APP_ID!, redirect_uri: redirectUri, state, scope: SCOPE, response_type: "code" });
    return `https://www.facebook.com/${VERSION()}/dialog/oauth?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const app = { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET! };
    const short = await g<{ access_token: string }>("/oauth/access_token", { ...app, redirect_uri: redirectUri, code });
    const long = await g<{ access_token: string; expires_in?: number }>("/oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token });
    const accounts = await g<{ data: { id: string; name: string; account_status: number; currency: string }[] }>("/me/adaccounts", { access_token: long.access_token, fields: "name,account_status,currency", limit: "50" });
    const acct = accounts.data.find((a) => a.account_status === 1) ?? accounts.data[0];
    if (!acct) throw new Error("No Meta ad account was found for that login.");
    return {
      externalAccountId: acct.id, // "act_123..."
      displayName: acct.name,
      scopes: SCOPE,
      accessToken: long.access_token,
      tokenExpiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000),
    };
  },

  async sync(connection, since, { accessToken }) {
    if (!accessToken) throw new Error("Meta sign-in is missing; reconnect Meta Ads.");
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) throw new Error("Meta sign-in expired after 60 days. Reconnect Meta Ads.");
    const acct = await g<{ currency: string }>(`/${connection.externalAccountId}`, { access_token: accessToken, fields: "currency" });
    const from = new Date(since ? Math.min(since.getTime(), Date.now()) - 7 * 864e5 : Date.now() - 90 * 864e5);
    let page = await g<{ data: MetaInsightRow[]; paging?: { next?: string } }>(`/${connection.externalAccountId}/insights`, {
      access_token: accessToken,
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: ymd(from), until: ymd(new Date()) }),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,action_values",
      limit: "500",
    });
    const ads: MappedAdDay[] = [];
    for (let i = 0; i < 200; i++) {
      for (const r of page.data) {
        const m = mapMetaInsight(r, acct.currency);
        if (m) ads.push(m);
      }
      if (!page.paging?.next) break;
      page = await g(page.paging.next, {});
    }
    return { money: [], ads };
  },

  async disconnect(_c, { accessToken }) {
    if (accessToken) await fetch(`${graph()}/me/permissions?access_token=${encodeURIComponent(accessToken)}`, { method: "DELETE" });
  },
};
