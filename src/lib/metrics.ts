import "server-only";
import { db } from "./db";
import { moneyScope } from "./money-filter";
import { cashSignals, dailyNet, inRange, invoiceSignals, invoiceSummary, moneySignals, runwayMonths, totals } from "./metrics-core";

export async function moneySnapshot(workspaceId: string, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - 30 * 864e5);
  const prevStart = new Date(start.getTime() - 30 * 864e5);
  const scope = await moneyScope(workspaceId);
  const [txs, invoices, balances] = await Promise.all([
    db.moneyTransaction.findMany({
      where: { ...scope.where, occurredAt: { gte: prevStart, lt: end } },
      select: { kind: true, amountCents: true, occurredAt: true, currency: true },
    }),
    db.invoice.findMany({ where: { workspaceId, balanceCents: { gt: 0 } }, select: { direction: true, balanceCents: true, dueAt: true, contact: true } }),
    db.accountBalance.findMany({ where: { connection: { workspaceId, status: { not: "disconnected" } } } }),
  ]);
  const cash = balances.filter((b) => b.type === "depository").reduce((s, b) => s + b.currentCents, 0);
  const cardDebt = balances.filter((b) => b.type === "credit").reduce((s, b) => s + b.currentCents, 0);
  const cur = totals(inRange(txs, start, end));
  const prev = totals(inRange(txs, prevStart, start));
  const currency = scope.currency;
  const inv = invoiceSummary(invoices, now);
  const signals = [...(balances.length ? cashSignals(cash, cardDebt, cur.net, currency) : []), ...invoiceSignals(inv, cur.sales, currency), ...moneySignals(cur, prev)];
  // Drop the "all good" line if invoices raised something.
  const filtered = signals.length > 1 ? signals.filter((s) => s.severity !== "good") : signals;
  return { cur, prev, currency, countingNote: scope.note, daily: dailyNet(inRange(txs, start, end), start, 30), signals: filtered, invoices: inv, hasInvoices: invoices.length > 0, bank: balances.length ? { cash, cardDebt, runway: runwayMonths(cash, cur.net), accounts: balances } : null };
}
