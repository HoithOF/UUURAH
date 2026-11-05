import { createHmac, timingSafeEqual } from "node:crypto";
import type { MappedMoney } from "./stripe-map";

// Pure helpers for Shopify: shop address checks, OAuth/webhook signatures and order mapping.

/** Accepts "my-store", "my-store.myshopify.com" or a full admin URL; returns "my-store.myshopify.com" or null. */
export function normalizeShop(input: string) {
  let s = input.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

/** OAuth callback check: hex HMAC-SHA256 (client secret) over the other params, sorted, as name=value joined by &. */
export function validCallbackHmac(params: URLSearchParams, secret: string) {
  const given = params.get("hmac");
  if (!given) return false;
  const msg = [...params.entries()].filter(([k]) => k !== "hmac" && k !== "signature").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
  const expected = Buffer.from(createHmac("sha256", secret).update(msg).digest("hex"));
  const g = Buffer.from(given);
  return g.length === expected.length && timingSafeEqual(g, expected);
}

/** Webhook check: base64 HMAC-SHA256 (client secret) of the raw body, in X-Shopify-Hmac-SHA256. */
export function validWebhookHmac(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"));
  const g = Buffer.from(header);
  return g.length === expected.length && timingSafeEqual(g, expected);
}

type Money = { shopMoney: { amount: string; currencyCode: string } };
export type ShopifyOrder = { id: string; name: string; processedAt: string; updatedAt?: string; cancelledAt: string | null; test: boolean; totalPriceSet: Money; totalRefundedSet: Money };

const cents = (m: Money) => Math.round(Number(m.shopMoney.amount) * 100);

/**
 * One order becomes a sale, plus a refund row if anything was refunded.
 * Test orders, and cancelled orders with nothing refunded (never paid), are dropped and reported for removal.
 */
export function mapShopifyOrder(o: ShopifyOrder): { rows: MappedMoney[]; removeIds: string[] } {
  const saleId = o.id;
  const refundId = `${o.id}|refund`;
  const total = cents(o.totalPriceSet);
  const refunded = cents(o.totalRefundedSet);
  if (o.test || (o.cancelledAt && refunded === 0)) return { rows: [], removeIds: [saleId, refundId] };
  const currency = o.totalPriceSet.shopMoney.currencyCode;
  const at = new Date(o.processedAt);
  const rows: MappedMoney[] = [{ externalId: saleId, kind: "sale", amountCents: total, currency, occurredAt: at, description: `Order ${o.name}`, category: "Online store" }];
  if (refunded > 0)
    rows.push({ externalId: refundId, kind: "refund", amountCents: -refunded, currency, occurredAt: o.cancelledAt ? new Date(o.cancelledAt) : at, description: `Refund on order ${o.name}`, category: "Refund" });
  return { rows, removeIds: refunded > 0 ? [] : [refundId] };
}
