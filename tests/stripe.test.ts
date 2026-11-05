import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mapBalanceTransaction, verifyStripeWebhook } from "../src/connectors/stripe-map.ts";

test("a charge becomes a sale plus a fee line", () => {
  const out = mapBalanceTransaction({ id: "txn_1", amount: 10000, fee: 320, currency: "usd", created: 1760000000, type: "charge", description: "Order 42" });
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].kind, out[0].amountCents, out[0].currency], ["sale", 10000, "USD"]);
  assert.deepEqual([out[1].kind, out[1].amountCents, out[1].externalId], ["fee", -320, "txn_1:fee"]);
});

test("refunds and payouts keep their sign", () => {
  assert.equal(mapBalanceTransaction({ id: "r", amount: -500, fee: 0, currency: "usd", created: 1, type: "refund", description: null })[0].kind, "refund");
  const p = mapBalanceTransaction({ id: "p", amount: -9000, fee: 0, currency: "usd", created: 1, type: "payout", description: null });
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, "payout");
});

test("webhook signatures: valid, tampered, stale", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "charge.succeeded", account: "acct_1", data: {} });
  const t = 1760000000;
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const header = `t=${t},v1=${sig}`;
  assert.equal(verifyStripeWebhook(body, header, secret, 300, t).account, "acct_1");
  assert.throws(() => verifyStripeWebhook(body + " ", header, secret, 300, t), /mismatch/);
  assert.throws(() => verifyStripeWebhook(body, header, secret, 300, t + 1000), /tolerance/);
  assert.throws(() => verifyStripeWebhook(body, null, secret), /Missing/);
});
