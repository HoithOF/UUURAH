import type { MappedMoney } from "./stripe-map";

// Pure mapping from Square's Payments and Refunds API objects to the shared money format.

interface Money { amount?: number; currency?: string }
export interface SquarePayment {
  id: string;
  status: string;
  created_at: string;
  amount_money?: Money;
  tip_money?: Money;
  total_money?: Money;
  processing_fee?: { amount_money?: Money; effective_at?: string }[];
  note?: string;
  location_id?: string;
  source_type?: string;
}
export interface SquareRefund { id: string; status: string; created_at: string; amount_money?: Money; reason?: string; payment_id?: string }

export function mapSquarePayment(p: SquarePayment, locationNames: Record<string, string> = {}): MappedMoney[] {
  if (p.status !== "COMPLETED") return [];
  const money = p.total_money ?? p.amount_money;
  if (!money?.amount) return [];
  const currency = (money.currency ?? "USD").toUpperCase();
  const occurredAt = new Date(p.created_at);
  const where = p.location_id ? locationNames[p.location_id] ?? null : null;
  const out: MappedMoney[] = [{
    externalId: p.id, kind: "sale", amountCents: money.amount, currency, occurredAt,
    description: p.note || (where ? `Sale at ${where}` : "Square sale"), category: where ?? p.source_type ?? "square",
  }];
  const fee = (p.processing_fee ?? []).reduce((s, f) => s + (f.amount_money?.amount ?? 0), 0);
  if (fee) out.push({ externalId: `${p.id}:fee`, kind: "fee", amountCents: -fee, currency, occurredAt, description: "Square processing fee", category: "square_fee" });
  return out;
}

export function mapSquareRefund(r: SquareRefund): MappedMoney[] {
  if (r.status !== "COMPLETED" || !r.amount_money?.amount) return [];
  return [{
    externalId: `refund:${r.id}`, kind: "refund", amountCents: -Math.abs(r.amount_money.amount),
    currency: (r.amount_money.currency ?? "USD").toUpperCase(), occurredAt: new Date(r.created_at),
    description: r.reason || "Square refund", category: "refund",
  }];
}
