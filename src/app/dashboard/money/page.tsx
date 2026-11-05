import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { fmtDate } from "@/lib/dates";
import { moneySnapshot } from "@/lib/metrics";
import { formatMoney } from "@/lib/metrics-core";
import { MoneyChart } from "@/components/MoneyChart";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";

const KIND_LABEL: Record<string, string> = { sale: "Sale", refund: "Refund", fee: "Fee", expense: "Expense", payout: "Payout" };
const SOURCE_LABEL: Record<string, string> = { stripe: "Stripe", square: "Square", csv: "Spreadsheet", quickbooks: "QuickBooks", xero: "Xero", plaid: "Bank" };

export default async function MoneyPage() {
  const { workspace, user } = await requireWorkspace();
  const [money, recent, overdue] = await Promise.all([
    moneySnapshot(workspace.id),
    db.moneyTransaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { occurredAt: "desc" }, take: 50 }),
    db.invoice.findMany({ where: { workspaceId: workspace.id, direction: "receivable", balanceCents: { gt: 0 }, dueAt: { lt: new Date() } }, orderBy: { dueAt: "asc" }, take: 10 }),
  ]);
  const c = money.currency;

  if (recent.length === 0)
    return (
      <>
        <h1>Money</h1>
        <p className="muted">Nothing here yet. Connect Stripe or upload a spreadsheet to see sales, spending and fees.</p>
        <Link className="btn primary" href="/dashboard/connections">Connect money apps</Link>
      </>
    );

  return (
    <>
      <h1>Money</h1>
      <p className="muted">Last 30 days from every connected money app.</p>
      {money.countingNote && <p className="small muted">{money.countingNote}</p>}
      <div className="grid" style={{ marginTop: 16 }}>
        <Stat label="Sales" cents={money.cur.sales} prevCents={money.prev.sales} currency={c} />
        <Stat label="Refunds" cents={money.cur.refunds} prevCents={money.prev.refunds} currency={c} goodWhenUp={false} />
        <Stat label="Fees" cents={money.cur.fees} prevCents={money.prev.fees} currency={c} goodWhenUp={false} />
        <Stat label="Spending" cents={money.cur.expenses} prevCents={money.prev.expenses} currency={c} goodWhenUp={false} />
        <Stat label="Net" cents={money.cur.net} currency={c} />
      </div>

      <h2>Money in vs. money out, per day</h2>
      <div className="card"><MoneyChart daily={money.daily} /></div>

      {money.bank && (
        <>
          <h2>Cash in the bank</h2>
          <div className="grid">
            <Stat label="Cash on hand" cents={money.bank.cash} currency={c} />
            <Stat label="Owed on cards" cents={money.bank.cardDebt} currency={c} />
            <div className="card stat">
              <div className="label">Runway</div>
              <div className="value">{money.bank.runway === null ? "Not burning cash" : `${money.bank.runway.toFixed(1)} months`}</div>
              <div className="small muted">At the last 30 days&apos; pace</div>
            </div>
          </div>
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Account</th><th>Type</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {money.bank.accounts.map((a) => (
                <tr key={a.id}><td>{a.name}</td><td>{a.type}</td><td className="num">{formatMoney(a.currentCents, a.currency)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {money.hasInvoices && (
        <>
          <h2>Invoices and bills</h2>
          <div className="grid">
            <Stat label="Customers owe you" cents={money.invoices.owedToYou} currency={c} />
            <Stat label="Of that, overdue" cents={money.invoices.owedToYouOverdue} currency={c} />
            <Stat label="You owe suppliers" cents={money.invoices.youOwe} currency={c} />
            <Stat label="Bills due this week" cents={money.invoices.billsDueSoon} currency={c} />
          </div>
          {overdue.length > 0 && (
            <>
              <h2>Overdue customer invoices</h2>
              <table>
                <thead><tr><th>Customer</th><th>Invoice</th><th>Due</th><th className="num">Days late</th><th className="num">Still owed</th></tr></thead>
                <tbody>
                  {overdue.map((i) => (
                    <tr key={i.id}>
                      <td>{i.contact ?? "Unknown"}</td>
                      <td>{i.number ?? "-"}</td>
                      <td>{fmtDate(i.dueAt!, user.timeZone)}</td>
                      <td className="num down">{Math.floor((Date.now() - i.dueAt!.getTime()) / 864e5)}</td>
                      <td className="num">{formatMoney(i.balanceCents, i.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      <h2>Signals</h2>
      <Signals signals={money.signals} />

      <h2>Latest transactions</h2>
      <table>
        <thead><tr><th>Date</th><th>What</th><th>Type</th><th>From</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {recent.map((t) => (
            <tr key={t.id}>
              <td>{fmtDate(t.occurredAt, user.timeZone)}</td>
              <td>{t.description ?? <span className="muted">No description</span>}{t.category && <div className="small muted">{t.category}</div>}</td>
              <td>{KIND_LABEL[t.kind] ?? t.kind}</td>
              <td>{SOURCE_LABEL[t.source] ?? t.source}</td>
              <td className={`num ${t.amountCents < 0 ? "down" : ""}`}>{formatMoney(t.amountCents, t.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
