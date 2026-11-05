import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { moneySnapshot } from "@/lib/metrics";
import { formatMoney } from "@/lib/metrics-core";
import { MoneyChart } from "@/components/MoneyChart";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";

const KIND_LABEL: Record<string, string> = { sale: "Sale", refund: "Refund", fee: "Fee", expense: "Expense", payout: "Payout" };
const SOURCE_LABEL: Record<string, string> = { stripe: "Stripe", csv: "Spreadsheet" };

export default async function MoneyPage() {
  const { workspace } = await requireWorkspace();
  const [money, recent] = await Promise.all([
    moneySnapshot(workspace.id),
    db.moneyTransaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { occurredAt: "desc" }, take: 50 }),
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
      <div className="grid" style={{ marginTop: 16 }}>
        <Stat label="Sales" cents={money.cur.sales} prevCents={money.prev.sales} currency={c} />
        <Stat label="Refunds" cents={money.cur.refunds} prevCents={money.prev.refunds} currency={c} goodWhenUp={false} />
        <Stat label="Fees" cents={money.cur.fees} prevCents={money.prev.fees} currency={c} goodWhenUp={false} />
        <Stat label="Spending" cents={money.cur.expenses} prevCents={money.prev.expenses} currency={c} goodWhenUp={false} />
        <Stat label="Net" cents={money.cur.net} currency={c} />
      </div>

      <h2>Money in vs. money out, per day</h2>
      <div className="card"><MoneyChart daily={money.daily} /></div>

      <h2>Signals</h2>
      <Signals signals={money.signals} />

      <h2>Latest transactions</h2>
      <table>
        <thead><tr><th>Date</th><th>What</th><th>Type</th><th>From</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {recent.map((t) => (
            <tr key={t.id}>
              <td>{t.occurredAt.toISOString().slice(0, 10)}</td>
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
