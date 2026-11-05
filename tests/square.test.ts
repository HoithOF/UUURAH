import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSquarePayment, mapSquareRefund } from "../src/connectors/square-map.ts";

test("completed payment becomes a sale with location and a fee line", () => {
  const out = mapSquarePayment(
    { id: "p1", status: "COMPLETED", created_at: "2026-10-01T15:00:00Z", amount_money: { amount: 2000, currency: "USD" }, total_money: { amount: 2300, currency: "USD" }, processing_fee: [{ amount_money: { amount: 66, currency: "USD" } }], location_id: "L1" },
    { L1: "Main St" },
  );
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].kind, out[0].amountCents, out[0].category], ["sale", 2300, "Main St"]);
  assert.deepEqual([out[1].kind, out[1].amountCents], ["fee", -66]);
});

test("pending or failed payments are ignored", () => {
  assert.equal(mapSquarePayment({ id: "p2", status: "FAILED", created_at: "2026-10-01T00:00:00Z", amount_money: { amount: 500 } }).length, 0);
});

test("refunds are negative and namespaced so they never collide with payment ids", () => {
  const [r] = mapSquareRefund({ id: "r1", status: "COMPLETED", created_at: "2026-10-02T00:00:00Z", amount_money: { amount: 700, currency: "usd" } });
  assert.deepEqual([r.kind, r.amountCents, r.externalId, r.currency], ["refund", -700, "refund:r1", "USD"]);
});
