import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mapShopifyOrder, normalizeShop, validCallbackHmac, validWebhookHmac } from "../src/connectors/shopify-map.ts";

test("shop address", () => {
  assert.equal(normalizeShop("Acme-Roofing"), "acme-roofing.myshopify.com");
  assert.equal(normalizeShop("https://acme.myshopify.com/admin"), "acme.myshopify.com");
  assert.equal(normalizeShop("evil.com"), null);
  assert.equal(normalizeShop("acme.myshopify.com.evil.com"), null);
  assert.equal(normalizeShop("a b"), null);
});

test("callback hmac: sorted name=value pairs, hex", () => {
  const p = new URLSearchParams({ code: "0907a61c0c8d55e99db179b68161bc00", shop: "some-shop.myshopify.com", state: "0.6784241404160823", timestamp: "1337178173" });
  const msg = "code=0907a61c0c8d55e99db179b68161bc00&shop=some-shop.myshopify.com&state=0.6784241404160823&timestamp=1337178173";
  p.set("hmac", createHmac("sha256", "secret").update(msg).digest("hex"));
  assert.ok(validCallbackHmac(p, "secret"));
  p.set("shop", "other.myshopify.com");
  assert.ok(!validCallbackHmac(p, "secret"));
});

test("webhook hmac: base64 of raw body", () => {
  const body = '{"shop_domain":"x.myshopify.com"}';
  const h = createHmac("sha256", "secret").update(body).digest("base64");
  assert.ok(validWebhookHmac(body, h, "secret"));
  assert.ok(!validWebhookHmac(body + " ", h, "secret"));
});

const base = { id: "gid://shopify/Order/1", name: "#1001", processedAt: "2026-10-20T15:00:00Z", cancelledAt: null, test: false, totalPriceSet: { shopMoney: { amount: "120.50", currencyCode: "USD" } }, totalRefundedSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } } };

test("orders map to sales and refunds", () => {
  assert.deepEqual(mapShopifyOrder(base).rows.map((r) => [r.kind, r.amountCents]), [["sale", 12050]]);
  const refunded = mapShopifyOrder({ ...base, totalRefundedSet: { shopMoney: { amount: "20", currencyCode: "USD" } } });
  assert.deepEqual(refunded.rows.map((r) => [r.kind, r.amountCents]), [["sale", 12050], ["refund", -2000]]);
  assert.deepEqual(mapShopifyOrder({ ...base, test: true }).rows, []);
  const cancelledUnpaid = mapShopifyOrder({ ...base, cancelledAt: "2026-10-21T00:00:00Z" });
  assert.deepEqual(cancelledUnpaid.rows, []);
  assert.deepEqual(cancelledUnpaid.removeIds, ["gid://shopify/Order/1", "gid://shopify/Order/1|refund"]);
});
