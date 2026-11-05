import { test } from "node:test";
import assert from "node:assert/strict";
import { mapPlaidAccount, mapPlaidTxn } from "../src/connectors/plaid-map.ts";
import { cashSignals, runwayMonths } from "../src/lib/metrics-core.ts";

const base = { account_id: "a", iso_currency_code: "USD", date: "2026-10-10", name: "X", pending: false };

test("Plaid sign is flipped: spending is negative", () => {
  const [t] = mapPlaidTxn({ ...base, transaction_id: "t1", amount: 42.5, personal_finance_category: { primary: "FOOD_AND_DRINK" } });
  assert.deepEqual([t.kind, t.amountCents, t.category], ["expense", -4250, "Food and drink"]);
});

test("transfers and payouts are neutral so Stripe sales aren't counted twice", () => {
  assert.equal(mapPlaidTxn({ ...base, transaction_id: "t2", amount: -900, personal_finance_category: { primary: "TRANSFER_IN" } })[0].kind, "payout");
  assert.equal(mapPlaidTxn({ ...base, transaction_id: "t3", amount: -900, personal_finance_category: { primary: "INCOME" } })[0].kind, "sale");
  assert.equal(mapPlaidTxn({ ...base, transaction_id: "t4", amount: 15, personal_finance_category: { primary: "BANK_FEES" } })[0].kind, "fee");
});

test("pending transactions wait until they post", () => {
  assert.equal(mapPlaidTxn({ ...base, transaction_id: "t5", amount: 10, pending: true }).length, 0);
});

test("accounts become balances", () => {
  const b = mapPlaidAccount({ account_id: "a1", name: "Checking", mask: "1234", type: "depository", balances: { current: 5230.12, iso_currency_code: "USD" } });
  assert.deepEqual([b?.name, b?.currentCents, b?.type], ["Checking ••1234", 523012, "depository"]);
});

test("runway", () => {
  assert.equal(runwayMonths(100000, 50000), null);
  assert.equal(runwayMonths(100000, -50000), 2);
  const s = cashSignals(100000, 0, -50000);
  assert.equal(s[0].severity, "critical");
  assert.equal(s[0].title, "About 2 months of cash left");
});
