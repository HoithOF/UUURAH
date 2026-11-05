import { createHmac, timingSafeEqual } from "node:crypto";

// Pure Stripe helpers: mapping balance transactions and verifying webhooks.

export interface StripeBalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  currency: string;
  created: number;
  type: string;
  description: string | null;
  reporting_category?: string;
}

export interface MappedMoney {
  externalId: string;
  kind: "sale" | "refund" | "fee" | "expense" | "payout";
  amountCents: number;
  currency: string;
  occurredAt: Date;
  description: string | null;
  category: string | null;
}

const SALE_TYPES = new Set(["charge", "payment"]);
const REFUND_TYPES = new Set(["refund", "payment_refund", "payment_failure_refund"]);
const PAYOUT_TYPES = new Set(["payout", "payout_cancel", "payout_failure"]);
const FEE_TYPES = new Set(["stripe_fee", "application_fee", "tax_fee"]);

export function mapBalanceTransaction(t: StripeBalanceTransaction): MappedMoney[] {
  const base = { currency: t.currency.toUpperCase(), occurredAt: new Date(t.created * 1000), description: t.description, category: t.reporting_category ?? t.type };
  const out: MappedMoney[] = [];
  let kind: MappedMoney["kind"];
  if (SALE_TYPES.has(t.type)) kind = "sale";
  else if (REFUND_TYPES.has(t.type)) kind = "refund";
  else if (PAYOUT_TYPES.has(t.type)) kind = "payout";
  else if (FEE_TYPES.has(t.type)) kind = "fee";
  else if (t.type === "adjustment" && t.amount < 0) kind = "expense";
  else kind = t.amount >= 0 ? "sale" : "expense";

  out.push({ ...base, externalId: t.id, kind, amountCents: t.amount });
  // Processing fees on a sale or refund are their own line so "fees" can be tracked.
  if (t.fee && kind !== "fee") out.push({ ...base, externalId: `${t.id}:fee`, kind: "fee", amountCents: -t.fee, description: "Stripe processing fee", category: "stripe_fee" });
  return out;
}

// Verifies the Stripe-Signature header (scheme v1) and returns the parsed event.
export function verifyStripeWebhook(payload: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header) throw new Error("Missing Stripe-Signature header");
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(nowSec - Number(t)) > toleranceSec) throw new Error("Webhook timestamp outside tolerance");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  const ok = sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) throw new Error("Webhook signature mismatch");
  return JSON.parse(payload) as { id: string; type: string; account?: string; data: { object: unknown } };
}
