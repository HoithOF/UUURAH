import type { MappedMoney } from "./stripe-map";
import type { MappedInvoice } from "./types";

// Pure mapping from Xero accounting API objects.

// Xero dates come as "/Date(1730764800000+0000)/" or ISO strings.
export function xeroDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = s.match(/\/Date\((-?\d+)([+-]\d{4})?\)\//);
  if (m) return new Date(Number(m[1]));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

const cents = (n: number | undefined) => Math.round((n ?? 0) * 100);

export interface XeroBankTxn { BankTransactionID: string; Type: string; Status: string; Date: string; Total: number; CurrencyCode?: string; Reference?: string; Contact?: { Name?: string }; LineItems?: { AccountCode?: string; Description?: string }[] }
export interface XeroPayment { PaymentID: string; PaymentType: string; Status: string; Date: string; Amount: number; CurrencyRate?: number; Invoice?: { Contact?: { Name?: string }; CurrencyCode?: string; InvoiceNumber?: string } }
export interface XeroInvoice { InvoiceID: string; Type: string; Status: string; InvoiceNumber?: string; Contact?: { Name?: string }; Total: number; AmountDue: number; CurrencyCode?: string; Date: string; DueDate?: string }

export function mapXeroBankTxn(t: XeroBankTxn): MappedMoney[] {
  if (t.Status !== "AUTHORISED" || !t.Total) return [];
  const incoming = t.Type.startsWith("RECEIVE");
  const outgoing = t.Type.startsWith("SPEND");
  if (!incoming && !outgoing) return [];
  return [{
    externalId: `bank:${t.BankTransactionID}`,
    kind: incoming ? "sale" : "expense",
    amountCents: incoming ? cents(t.Total) : -cents(t.Total),
    currency: (t.CurrencyCode ?? "USD").toUpperCase(),
    occurredAt: xeroDate(t.Date) ?? new Date(),
    description: t.Contact?.Name ?? t.Reference ?? t.LineItems?.[0]?.Description ?? null,
    category: incoming ? "Money received" : "Money spent",
  }];
}

export function mapXeroPayment(p: XeroPayment): MappedMoney[] {
  if (p.Status !== "AUTHORISED" || !p.Amount) return [];
  const received = p.PaymentType === "ACCRECPAYMENT";
  const paid = p.PaymentType === "ACCPAYPAYMENT";
  if (!received && !paid) return [];
  return [{
    externalId: `payment:${p.PaymentID}`,
    kind: received ? "sale" : "expense",
    amountCents: received ? cents(p.Amount) : -cents(p.Amount),
    currency: (p.Invoice?.CurrencyCode ?? "USD").toUpperCase(),
    occurredAt: xeroDate(p.Date) ?? new Date(),
    description: p.Invoice?.Contact?.Name ? `${received ? "Payment from" : "Bill paid to"} ${p.Invoice.Contact.Name}` : null,
    category: received ? "Invoice payment" : "Bills",
  }];
}

export function mapXeroInvoice(i: XeroInvoice): MappedInvoice | null {
  if (i.Status === "DRAFT" || i.Status === "DELETED" || i.Status === "VOIDED" || i.Status === "SUBMITTED") return null;
  const total = cents(i.Total);
  const due = cents(i.AmountDue);
  return {
    externalId: `invoice:${i.InvoiceID}`,
    direction: i.Type === "ACCREC" ? "receivable" : "payable",
    number: i.InvoiceNumber ?? null,
    contact: i.Contact?.Name ?? null,
    totalCents: total,
    balanceCents: due,
    currency: (i.CurrencyCode ?? "USD").toUpperCase(),
    issuedAt: xeroDate(i.Date) ?? new Date(),
    dueAt: xeroDate(i.DueDate),
    status: due === 0 ? "paid" : due < total ? "partial" : "open",
  };
}
