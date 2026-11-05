import "server-only";
import type { Connection } from "@prisma/client";
import type { LiveConnector } from "./types";
import { mapBalanceTransaction, type MappedMoney, type StripeBalanceTransaction } from "./stripe-map";

// Stripe Connect (OAuth, read-only). The owner signs in on Stripe's site; we keep
// only their account id and call the API with our platform key + Stripe-Account header,
// which is Stripe's recommended pattern.

const API = "https://api.stripe.com/v1";

async function stripeFetch<T>(path: string, init: RequestInit & { account?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` };
  if (init.account) headers["Stripe-Account"] = init.account;
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe request failed (${res.status})`);
  return body as T;
}

export const stripeConnector: LiveConnector = {
  id: "stripe",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.STRIPE_CLIENT_ID && process.env.STRIPE_SECRET_KEY);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ response_type: "code", client_id: process.env.STRIPE_CLIENT_ID!, scope: "read_only", state, redirect_uri: redirectUri });
    return `https://connect.stripe.com/oauth/authorize?${p}`;
  },

  async exchangeCode(code) {
    const token = await stripeFetch<{ stripe_user_id: string; scope: string }>("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code }),
    });
    const account = await stripeFetch<{ business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; email?: string }>(`/accounts/${token.stripe_user_id}`);
    const displayName = account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || token.stripe_user_id;
    return { externalAccountId: token.stripe_user_id, displayName, scopes: token.scope };
  },

  async sync(connection, since, _ctx) {
    // Re-read a day of overlap so late updates are caught; upserts make it idempotent.
    const from = since ? Math.floor(since.getTime() / 1000) - 86400 : Math.floor(Date.now() / 1000) - 365 * 86400;
    const money: MappedMoney[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 100; page++) {
      const q = new URLSearchParams({ limit: "100", "created[gte]": String(from) });
      if (startingAfter) q.set("starting_after", startingAfter);
      const res = await stripeFetch<{ data: StripeBalanceTransaction[]; has_more: boolean }>(`/balance_transactions?${q}`, { account: connection.externalAccountId });
      for (const t of res.data) money.push(...mapBalanceTransaction(t));
      if (!res.has_more || res.data.length === 0) break;
      startingAfter = res.data[res.data.length - 1].id;
    }
    return { money };
  },

  async disconnect(connection, _ctx) {
    await stripeFetch("https://connect.stripe.com/oauth/deauthorize", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.STRIPE_CLIENT_ID!, stripe_user_id: connection.externalAccountId }),
    });
  },
};
