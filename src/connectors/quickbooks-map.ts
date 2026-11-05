import type { MappedMoney } from "./stripe-map";
import type { MappedInvoice } from "./types";

// Pure mapping from QuickBooks Online entities to the shared formats.
// Money is cash-basis: payments received, sales receipts, refunds and purchases.
// Invoices and bills go to the invoice table so unpaid and overdue amounts can be tracked.

interface Ref { value?: string; name?: string }
export interface QbTxn {
  Id: string;
  TxnDate: string;
  TotalAmt?: number;
  CurrencyRef?: Ref;
  PrivateNote?: string;
  DocNumber?: string;
  CustomerRef?: Ref;
  VendorRef?: Ref;
  EntityRef?: Ref & { type?: string };
  AccountRef?: Ref;
  Line?: { AccountBasedExpenseLineDetail?: { AccountRef?: Ref } }[];
  Balance?: number;
  DueDate?: string;
}

const cents = (n: number | undefined) => Math.round((n ?? 0) * 100);
const day = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);
const cur = (t: QbTxn, fallback: string) => (t.CurrencyRef?.value ?? fallback).toUpperCase();

export function mapQbMoney(entity: "Payment" | "SalesReceipt" | "RefundReceipt" | "Purchase" | "BillPayment", t: QbTxn, home = "USD"): MappedMoney[] {
  const amount = cents(t.TotalAmt);
  if (!amount) return [];
  const base = { externalId: `${entity}:${t.Id}`, currency: cur(t, home), occurredAt: day(t.TxnDate) };
  switch (entity) {
    case "Payment":
      return [{ ...base, kind: "sale", amountCents: amount, description: t.CustomerRef?.name ? `Payment from ${t.CustomerRef.name}` : "Customer payment", category: "Invoice payment" }];
    case "SalesReceipt":
      return [{ ...base, kind: "sale", amountCents: amount, description: t.CustomerRef?.name ?? t.PrivateNote ?? "Sales receipt", category: "Sales receipt" }];
    case "RefundReceipt":
      return [{ ...base, kind: "refund", amountCents: -amount, description: t.CustomerRef?.name ? `Refund to ${t.CustomerRef.name}` : "Refund", category: "Refund" }];
    case "Purchase": {
      const account = t.Line?.find((l) => l.AccountBasedExpenseLineDetail)?.AccountBasedExpenseLineDetail?.AccountRef?.name;
      return [{ ...base, kind: "expense", amountCents: -amount, description: t.EntityRef?.name ?? t.PrivateNote ?? "Purchase", category: account ?? "Expense" }];
    }
    case "BillPayment":
      return [{ ...base, kind: "expense", amountCents: -amount, description: t.VendorRef?.name ? `Bill paid to ${t.VendorRef.name}` : "Bill payment", category: "Bills" }];
  }
}

export function mapQbInvoice(entity: "Invoice" | "Bill", t: QbTxn, home = "USD"): MappedInvoice {
  const balance = cents(t.Balance);
  const due = t.DueDate ? day(t.DueDate) : null;
  return {
    externalId: `${entity}:${t.Id}`,
    direction: entity === "Invoice" ? "receivable" : "payable",
    number: t.DocNumber ?? null,
    contact: (entity === "Invoice" ? t.CustomerRef?.name : t.VendorRef?.name) ?? null,
    totalCents: cents(t.TotalAmt),
    balanceCents: balance,
    currency: cur(t, home),
    issuedAt: day(t.TxnDate),
    dueAt: due,
    status: balance === 0 ? "paid" : balance < cents(t.TotalAmt) ? "partial" : "open",
  };
}
