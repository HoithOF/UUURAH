import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { moneySnapshot } from "@/lib/metrics";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";
import type { Signal } from "@/lib/metrics-core";

export default async function Overview() {
  const { workspace, user } = await requireWorkspace();
  const [connections, money] = await Promise.all([
    db.connection.findMany({ where: { workspaceId: workspace.id, status: { not: "disconnected" } } }),
    moneySnapshot(workspace.id),
  ]);

  const signals: Signal[] = [];
  for (const c of connections.filter((c) => c.status === "error"))
    signals.push({ severity: "critical", section: "connections", title: `${c.displayName} stopped syncing`, detail: c.lastError ?? "Reconnect it on the Connections page." });
  signals.push(...money.signals);

  return (
    <>
      <h1>Hi {user.name.split(" ")[0]}, here&apos;s {workspace.name}</h1>
      <p className="muted">Last 30 days, compared with the 30 days before.</p>

      {connections.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          <h2 style={{ marginTop: 0 }}>Start by connecting your first app</h2>
          <p>Sign in to Stripe, or upload a spreadsheet of your sales and spending. Your numbers show up here right away.</p>
          <Link className="btn primary" href="/dashboard/connections">Connect an app</Link>
        </div>
      ) : (
        <>
          <h2>Where you need to look</h2>
          <Signals signals={signals} />
          <h2>Money</h2>
          <div className="grid">
            <Stat label="Sales" cents={money.cur.sales} prevCents={money.prev.sales} currency={money.currency} />
            <Stat label="Spending" cents={money.cur.expenses} prevCents={money.prev.expenses} currency={money.currency} goodWhenUp={false} />
            <Stat label="Net" cents={money.cur.net} currency={money.currency} />
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            {connections.length} app{connections.length === 1 ? "" : "s"} connected. Marketing, communication, sales and payroll signals arrive as those apps are added.
          </p>
        </>
      )}
    </>
  );
}
