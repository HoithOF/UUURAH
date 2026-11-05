import { test } from "node:test";
import assert from "node:assert/strict";
import { countingRules, countedWhere, mainCurrency } from "../src/lib/money-sources.ts";

test("one app: everything counts, no note", () => {
  const r = countingRules(["quickbooks"]);
  assert.deepEqual(r.sales, ["quickbooks"]);
  assert.deepEqual(r.expenses, ["quickbooks"]);
  assert.equal(r.note, null);
});

test("Stripe + QuickBooks: sales from Stripe, spending from QuickBooks", () => {
  const r = countingRules(["stripe", "quickbooks", "csv"]);
  assert.deepEqual(r.sales, ["stripe", "csv"]);
  assert.deepEqual(r.expenses, ["quickbooks", "csv"]);
  assert.match(r.note!, /sales come from Stripe and spending from QuickBooks/);
  assert.match(r.note!, /cash or check/);
});

test("Square + bank: sales from Square, spending from the bank", () => {
  const r = countingRules(["square", "plaid"]);
  assert.deepEqual(r.sales, ["square"]);
  assert.deepEqual(r.expenses, ["plaid"]);
  assert.doesNotMatch(r.note!, /cash or check/);
});

test("filter keeps payouts and limits each kind to its source", () => {
  const w = countedWhere(countingRules(["stripe", "quickbooks"]));
  assert.deepEqual(w.OR[0], { kind: { in: ["sale", "refund"] }, source: { in: ["stripe"] } });
  assert.deepEqual(w.OR[3], { kind: "payout" });
});

test("main currency is the most common one", () => {
  assert.equal(mainCurrency([{ currency: "EUR", n: 3 }, { currency: "USD", n: 40 }]), "USD");
  assert.equal(mainCurrency([]), "USD");
});
