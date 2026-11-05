import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encrypt, decrypt } from "../src/lib/crypto.ts";
import { totals, moneySignals, dailyNet } from "../src/lib/metrics-core.ts";

process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");

test("tokens round-trip and tampering is detected", () => {
  const c = encrypt("sk_live_secret");
  assert.notEqual(c, "sk_live_secret");
  assert.equal(decrypt(c), "sk_live_secret");
  const parts = c.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decrypt(parts.join(".")));
});

const d = (s: string) => new Date(s);

test("totals ignore payouts", () => {
  const t = totals([
    { kind: "sale", amountCents: 1000, occurredAt: d("2026-10-01") },
    { kind: "fee", amountCents: -30, occurredAt: d("2026-10-01") },
    { kind: "payout", amountCents: -970, occurredAt: d("2026-10-02") },
    { kind: "expense", amountCents: -200, occurredAt: d("2026-10-02") },
  ]);
  assert.equal(t.net, 770);
});

test("signals flag a sales drop and overspending", () => {
  const prev = totals([{ kind: "sale", amountCents: 10000, occurredAt: d("2026-09-01") }]);
  const cur = totals([{ kind: "sale", amountCents: 6000, occurredAt: d("2026-10-01") }, { kind: "expense", amountCents: -8000, occurredAt: d("2026-10-01") }]);
  const titles = moneySignals(cur, prev).map((s) => s.title);
  assert.ok(titles.includes("Sales are down 40%"));
  assert.ok(titles.includes("You spent more than you made this month"));
});

test("healthy month says so", () => {
  const prev = totals([{ kind: "sale", amountCents: 10000, occurredAt: d("2026-09-01") }]);
  const cur = totals([{ kind: "sale", amountCents: 11000, occurredAt: d("2026-10-01") }]);
  assert.equal(moneySignals(cur, prev)[0].severity, "good");
});

test("daily buckets", () => {
  const days = dailyNet([{ kind: "sale", amountCents: 500, occurredAt: d("2026-10-02T10:00:00Z") }], d("2026-10-01T00:00:00Z"), 3);
  assert.equal(days[1].sales, 500);
});

import { invoiceSummary, invoiceSignals } from "../src/lib/metrics-core.ts";

test("overdue invoices become a signal", () => {
  const now = d("2026-11-01");
  const s = invoiceSummary([
    { direction: "receivable", balanceCents: 300000, dueAt: d("2026-10-01"), contact: "A" },
    { direction: "receivable", balanceCents: 100000, dueAt: d("2026-12-01"), contact: "B" },
    { direction: "payable", balanceCents: 5000, dueAt: d("2026-11-03"), contact: "S" },
  ], now);
  assert.equal(s.owedToYou, 400000);
  assert.equal(s.owedToYouOverdue, 300000);
  assert.equal(s.billsDueSoon, 5000);
  const sig = invoiceSignals(s, 1000000);
  assert.equal(sig.length, 1);
  assert.equal(sig[0].severity, "critical");
});
