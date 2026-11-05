import { fmtDate } from "@/lib/dates";
import { requireWorkspace } from "@/lib/workspace";
import { salesSnapshot } from "@/lib/sales-people";
import { formatMoney } from "@/lib/metrics-core";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";
import { EmptySection } from "@/components/EmptySection";

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 864e5);

export default async function SalesPage() {
  const { workspace, user } = await requireWorkspace();
  const s = await salesSnapshot(workspace.id);
  if (!s.hasData) return <EmptySection section="sales" intro="Every deal and every follow-up you owe, from your CRM." cta="Connect your CRM" />;
  const c = s.currency;
  const open = s.deals.filter((d) => !d.isClosed);
  const staleIds = new Set(s.summary.stale.map((d) => d.name + d.openedAt.getTime()));

  return (
    <>
      <h1>Sales and customers</h1>
      <p className="muted">Your pipeline right now, and the last 30 days of results.</p>
      <div className="grid" style={{ marginTop: 16 }}>
        <Stat label={`Open pipeline (${s.summary.openCount} deals)`} cents={s.summary.pipeline} currency={c} />
        <Stat label={`Won last 30 days (${s.summary.wonCount30})`} cents={s.summary.wonAmount30} currency={c} />
        <div className="card stat"><div className="label">Win rate, last 30 days</div><div className="value">{s.summary.winRate30 === null ? "-" : `${Math.round(s.summary.winRate30 * 100)}%`}</div></div>
        <div className="card stat"><div className="label">New deals, last 30 days</div><div className="value">{s.summary.newDeals30}</div></div>
      </div>
      {s.signals.length > 0 && (<><h2>Signals</h2><Signals signals={s.signals} /></>)}
      <h2>Open deals</h2>
      <table>
        <thead><tr><th>Deal</th><th>Stage</th><th>Expected close</th><th className="num">Last touched</th><th className="num">Value</th></tr></thead>
        <tbody>
          {open.map((d) => {
            const touched = d.lastActivityAt ?? d.openedAt;
            const cold = staleIds.has(d.name + d.openedAt.getTime());
            return (
              <tr key={d.id}>
                <td>{d.webLink ? <a href={d.webLink} target="_blank" rel="noopener noreferrer">{d.name}</a> : d.name}</td>
                <td>{d.stage}</td>
                <td className={d.closeDate && d.closeDate < new Date() ? "down" : ""}>{d.closeDate ? fmtDate(d.closeDate, user.timeZone) : "-"}</td>
                <td className={`num ${cold ? "down" : ""}`}>{daysSince(touched)} days ago</td>
                <td className="num">{formatMoney(d.amountCents, d.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
