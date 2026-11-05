import { fmtDate } from "@/lib/dates";
import { requireWorkspace } from "@/lib/workspace";
import { peopleSnapshot } from "@/lib/sales-people";
import { formatMoney } from "@/lib/metrics-core";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";
import { EmptySection } from "@/components/EmptySection";

export default async function PeoplePage() {
  const { workspace, role, user } = await requireWorkspace();
  const p = await peopleSnapshot(workspace.id);
  if (!p.hasData) return <EmptySection section="people" intro="Headcount, payroll cost and labor as a share of revenue." cta="Connect payroll" />;
  const c = p.currency;
  const showNames = role !== "member"; // keep the staff list away from regular members

  return (
    <>
      <h1>People and payroll</h1>
      <p className="muted">Totals only. Individual pay is never shown here.</p>
      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card stat"><div className="label">Active staff</div><div className="value">{p.summary.headcount}</div></div>
        <Stat label="Payroll, last 30 days" cents={p.summary.payroll30} prevCents={p.summary.payrollPrev30} currency={c} goodWhenUp={false} />
        <div className="card stat">
          <div className="label">Payroll as share of sales</div>
          <div className="value">{p.summary.laborShare === null ? "-" : `${Math.round(p.summary.laborShare * 100)}%`}</div>
          <div className="small muted">Sales come from your money apps</div>
        </div>
      </div>
      {p.signals.length > 0 && (<><h2>Signals</h2><Signals signals={p.signals} /></>)}
      <h2>Recent payroll runs</h2>
      <table>
        <thead><tr><th>Pay date</th><th className="num">People paid</th><th className="num">Gross</th><th className="num">Net</th></tr></thead>
        <tbody>
          {p.runs.slice(0, 12).map((r) => (
            <tr key={r.id}><td>{fmtDate(r.checkDate, user.timeZone)}</td><td className="num">{r.people}</td><td className="num">{formatMoney(r.grossCents, r.currency)}</td><td className="num">{formatMoney(r.netCents, r.currency)}</td></tr>
          ))}
        </tbody>
      </table>
      {showNames && p.employees.length > 0 && (
        <>
          <h2>Team</h2>
          <table>
            <thead><tr><th>Name</th><th>Title</th><th>Status</th><th>Started</th></tr></thead>
            <tbody>
              {p.employees.filter((e) => e.status !== "inactive").map((e) => (
                <tr key={e.id}><td>{e.name}</td><td>{e.title ?? "-"}</td><td>{e.status}</td><td>{e.startedAt ? fmtDate(e.startedAt, user.timeZone) : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
