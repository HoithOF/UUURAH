import "server-only";
import type { LiveConnector, MappedDeal, TokenSet } from "./types";
import { mapHubSpotDeal, type HubSpotDeal, type HubSpotStage } from "./crm-hr-map";

// HubSpot CRM deals (OAuth; access tokens last 30 minutes and refresh).

const API = "https://api.hubapi.com";
const SCOPES = "oauth crm.objects.deals.read crm.objects.contacts.read crm.schemas.deals.read";
const PROPS = "dealname,amount,deal_currency_code,dealstage,pipeline,closedate,createdate,hs_is_closed,hs_is_closed_won,notes_last_updated,notes_last_contacted,hs_last_sales_activity_timestamp";

async function tokenCall(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${API}/oauth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.HUBSPOT_CLIENT_ID!, client_secret: process.env.HUBSPOT_CLIENT_SECRET!, ...body }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.message ?? `HubSpot sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

async function hs<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? `HubSpot request failed (${res.status})`);
  return body as T;
}

export const hubspotConnector: LiveConnector = {
  id: "hubspot",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.HUBSPOT_CLIENT_ID!, redirect_uri: redirectUri, scope: SCOPES, state });
    return `https://app.hubspot.com/oauth/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const info = await hs<{ hub_id: number; hub_domain?: string }>(t.accessToken, `/oauth/v1/access-tokens/${t.accessToken}`);
    return { externalAccountId: String(info.hub_id), displayName: `HubSpot: ${info.hub_domain ?? info.hub_id}`, scopes: SCOPES, ...t };
  },

  refresh(refreshToken) {
    return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async sync(connection, _since, { accessToken }) {
    if (!accessToken) throw new Error("HubSpot sign-in is missing; reconnect HubSpot.");
    const pipelines = await hs<{ results: { stages: HubSpotStage[] }[] }>(accessToken, "/crm/v3/pipelines/deals");
    const stages = Object.fromEntries(pipelines.results.flatMap((p) => p.stages).map((s) => [s.id, s]));
    let currency = "USD";
    try {
      currency = (await hs<{ companyCurrency?: string }>(accessToken, "/account-info/v3/details")).companyCurrency ?? "USD";
    } catch { /* optional scope */ }
    const deals: MappedDeal[] = [];
    let after: string | undefined;
    for (let i = 0; i < 100; i++) {
      const page = await hs<{ results: HubSpotDeal[]; paging?: { next?: { after: string } } }>(accessToken, `/crm/v3/objects/deals?limit=100&archived=false&properties=${PROPS}${after ? `&after=${after}` : ""}`);
      for (const d of page.results) deals.push(mapHubSpotDeal(d, stages, currency, connection.externalAccountId));
      after = page.paging?.next?.after;
      if (!after) break;
    }
    return { money: [], deals };
  },

  async disconnect(_c, { accessToken }) {
    void accessToken; // HubSpot apps are uninstalled from the HubSpot side; nothing to revoke here.
  },
};
