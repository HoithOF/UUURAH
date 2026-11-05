import "server-only";
import type { LiveConnector, TokenSet } from "./types";
import { mapShopifyOrder, normalizeShop, validCallbackHmac, type ShopifyOrder } from "./shopify-map";
import type { MappedMoney } from "./stripe-map";

// Shopify online store orders (OAuth per store; expiring offline tokens that refresh, GraphQL Admin API).
// read_orders covers the last 60 days; older history needs Shopify to grant read_all_orders.

const VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-10";
const SCOPES = "read_orders";
const base = (shop: string) => process.env.SHOPIFY_BASE_URL?.replace("{shop}", shop) ?? `https://${shop}`;

async function tokenCall(shop: string, body: Record<string, string | number>): Promise<TokenSet> {
  const res = await fetch(`${base(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, ...body }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(t.error_description ?? t.errors ?? `Shopify sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : undefined };
}

const QUERY = `query Orders($first: Int!, $after: String, $q: String) {
  orders(first: $first, after: $after, query: $q, sortKey: UPDATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { id name processedAt updatedAt cancelledAt test
      totalPriceSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } } } }
  }
}`;

export const shopifyConnector: LiveConnector = {
  id: "shopify",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri, params) {
    const shop = normalizeShop(params?.get("shop") ?? "");
    if (!shop) throw new Error("Enter your store's .myshopify.com address.");
    const p = new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID!, scope: SCOPES, redirect_uri: redirectUri, state });
    return `${base(shop)}/admin/oauth/authorize?${p}`;
  },

  async exchangeCode(code, _redirectUri, params) {
    const shop = normalizeShop(params.get("shop") ?? "");
    if (!shop || !validCallbackHmac(params, process.env.SHOPIFY_CLIENT_SECRET!)) throw new Error("Shopify callback failed its signature check");
    // expiring=1 asks for an offline token that refreshes, which Shopify requires for new public apps.
    const t = await tokenCall(shop, { code, expiring: 1 });
    return { externalAccountId: shop, displayName: `Shopify: ${shop.replace(".myshopify.com", "")}`, scopes: SCOPES, ...t };
  },

  refresh(refreshToken, connection) {
    return tokenCall(connection.externalAccountId, { grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async sync(connection, since, { accessToken }) {
    if (!accessToken) throw new Error("Shopify sign-in is missing; reconnect Shopify.");
    const shop = connection.externalAccountId;
    // Re-read a day of overlap so late edits (refunds, cancellations) are caught.
    const from = since ? new Date(since.getTime() - 864e5) : new Date(Date.now() - 60 * 864e5);
    const money: MappedMoney[] = [];
    const removed: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < 200; page++) {
      const res: Response = await fetch(`${base(shop)}/admin/api/${VERSION}/graphql.json`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-Shopify-Access-Token": accessToken },
        body: JSON.stringify({ query: QUERY, variables: { first: 100, after, q: `updated_at:>='${from.toISOString()}'` } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.errors) throw new Error(`Shopify request failed: ${JSON.stringify(body.errors ?? res.status).slice(0, 200)}`);
      const conn = body.data.orders as { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: { node: ShopifyOrder }[] };
      for (const { node } of conn.edges) {
        const m = mapShopifyOrder(node);
        money.push(...m.rows);
        removed.push(...m.removeIds);
      }
      if (!conn.pageInfo.hasNextPage) break;
      after = conn.pageInfo.endCursor;
    }
    return { money, removedMoneyIds: removed };
  },
};
