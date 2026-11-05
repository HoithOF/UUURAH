import { test } from "node:test";
import assert from "node:assert/strict";
import { mapQbInvoice, mapQbMoney } from "../src/connectors/quickbooks-map.ts";
import { mapXeroBankTxn, mapXeroInvoice, mapXeroPayment, xeroDate } from "../src/connectors/xero-map.ts";

test("QuickBooks payments, purchases and refunds", () => {
  const [p] = mapQbMoney("Payment", { Id: "9", TxnDate: "2026-10-04", TotalAmt: 1250.5, CustomerRef: { name: "Acme" } });
  assert.deepEqual([p.kind, p.amountCents, p.externalId, p.description], ["sale", 125050, "Payment:9", "Payment from Acme"]);
  const [e] = mapQbMoney("Purchase", { Id: "3", TxnDate: "2026-10-05", TotalAmt: 80, EntityRef: { name: "Home Depot" }, Line: [{ AccountBasedExpenseLineDetail: { AccountRef: { name: "Supplies" } } }] });
  assert.deepEqual([e.kind, e.amountCents, e.category], ["expense", -8000, "Supplies"]);
  assert.equal(mapQbMoney("RefundReceipt", { Id: "1", TxnDate: "2026-10-05", TotalAmt: 20 })[0].amountCents, -2000);
  assert.equal(mapQbMoney("Payment", { Id: "2", TxnDate: "2026-10-05", TotalAmt: 0 }).length, 0);
});

test("QuickBooks invoices track what's still unpaid", () => {
  const i = mapQbInvoice("Invoice", { Id: "7", TxnDate: "2026-09-01", DueDate: "2026-10-01", TotalAmt: 1000, Balance: 400, DocNumber: "1007", CustomerRef: { name: "Bob" } });
  assert.deepEqual([i.direction, i.balanceCents, i.status, i.contact], ["receivable", 40000, "partial", "Bob"]);
  assert.equal(mapQbInvoice("Bill", { Id: "8", TxnDate: "2026-09-01", TotalAmt: 50, Balance: 0 }).status, "paid");
});

test("Xero dates in both formats", () => {
  assert.equal(xeroDate("/Date(1730764800000+0000)/")?.toISOString(), "2024-11-05T00:00:00.000Z");
  assert.equal(xeroDate("2026-10-01T00:00:00")?.getUTCFullYear(), 2026);
  assert.equal(xeroDate(undefined), null);
});

test("Xero bank transactions, payments and invoices", () => {
  assert.equal(mapXeroBankTxn({ BankTransactionID: "b", Type: "SPEND", Status: "AUTHORISED", Date: "/Date(1760000000000)/", Total: 99.99 })[0].amountCents, -9999);
  assert.equal(mapXeroBankTxn({ BankTransactionID: "b", Type: "RECEIVE", Status: "DELETED", Date: "/Date(1760000000000)/", Total: 5 }).length, 0);
  assert.equal(mapXeroPayment({ PaymentID: "p", PaymentType: "ACCRECPAYMENT", Status: "AUTHORISED", Date: "/Date(1760000000000)/", Amount: 300 })[0].kind, "sale");
  assert.equal(mapXeroInvoice({ InvoiceID: "i", Type: "ACCREC", Status: "DRAFT", Total: 1, AmountDue: 1, Date: "" }), null);
  const inv = mapXeroInvoice({ InvoiceID: "i", Type: "ACCPAY", Status: "AUTHORISED", Total: 200, AmountDue: 200, Date: "/Date(1760000000000)/", DueDate: "/Date(1761000000000)/" })!;
  assert.deepEqual([inv.direction, inv.status, inv.balanceCents], ["payable", "open", 20000]);
});
