import "server-only";
import { db } from "./db";
import { appUrl } from "./url";
import { access, subscriptionFields } from "./billing-core";

const API = () => process.env.STRIPE_API_URL ?? "https://api.stripe.com";
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 14);

/** Billing is on once a price is configured. Until then every company uses the app free. */
export function billingEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_BILLING_PRICE_ID);
}

export function workspaceAccess(ws: { trialEndsAt: Date | null; subscriptionStatus: string | null; currentPeriodEnd: Date | null }) {
  return access(ws, billingEnabled() && process.env.BILLING_ENFORCED !== "false");
}

async function stripe<T>(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(path, API());
  const init: RequestInit = { method, headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } };
  if (method === "POST") {
    init.body = new URLSearchParams(params);
    (init.headers as Record<string, string>)["content-type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json as T;
}

async function ensureCustomer(workspaceId: string, email: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  if (ws.stripeCustomerId) return ws.stripeCustomerId;
  const c = await stripe<{ id: string }>("POST", "/v1/customers", { email, name: ws.name, "metadata[workspaceId]": ws.id });
  await db.workspace.update({ where: { id: ws.id }, data: { stripeCustomerId: c.id } });
  return c.id;
}

export async function checkoutUrl(workspaceId: string, email: string) {
  const customer = await ensureCustomer(workspaceId, email);
  const s = await stripe<{ url: string }>("POST", "/v1/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: workspaceId,
    "line_items[0][price]": process.env.STRIPE_BILLING_PRICE_ID!,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][workspaceId]": workspaceId,
    allow_promotion_codes: "true",
    success_url: appUrl("/dashboard/billing?done=1"),
    cancel_url: appUrl("/dashboard/billing"),
  });
  return s.url;
}

export async function portalUrl(workspaceId: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  if (!ws.stripeCustomerId) throw new Error("No billing account yet.");
  const s = await stripe<{ url: string }>("POST", "/v1/billing_portal/sessions", { customer: ws.stripeCustomerId, return_url: appUrl("/dashboard/billing") });
  return s.url;
}

type Sub = Parameters<typeof subscriptionFields>[0] & { customer: string; metadata?: Record<string, string> };

export async function applySubscription(sub: Sub) {
  const fields = subscriptionFields(sub);
  const byCustomer = await db.workspace.updateMany({ where: { stripeCustomerId: sub.customer }, data: fields });
  if (byCustomer.count === 0 && sub.metadata?.workspaceId)
    await db.workspace.updateMany({ where: { id: sub.metadata.workspaceId }, data: { ...fields, stripeCustomerId: sub.customer } });
}

export async function fetchSubscription(id: string) {
  return stripe<Sub>("GET", `/v1/subscriptions/${id}`);
}

/** Cancels right away, for company deletion. */
export async function cancelSubscriptionNow(subscriptionId: string) {
  await stripe("POST", `/v1/subscriptions/${subscriptionId}/cancel`).catch(() => undefined);
}
