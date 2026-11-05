import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { moneySnapshot } from "@/lib/metrics";
import { marketingSnapshot } from "@/lib/marketing";
import { commSnapshot } from "@/lib/communication";
import { peopleSnapshot, salesSnapshot } from "@/lib/sales-people";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";
import { areaHealth, type Signal } from "@/lib/metrics-core";
import { HealthGrid } from "@/components/HealthGrid";

export default async function Overview() {
  const { workspace, user } = await requireWorkspace();
  const [connections, money, marketing, comm, sales, people] = await Promise.all([
    db.connection.findMany({ where: { workspaceId: workspace.id, status: { not: "disconnected" } } }),
    moneySnapshot(workspace.id),
    marketingSnapshot(workspace.id),
    commSnapshot(workspace.id),
    salesSnapshot(workspace.id),
    peopleSnapshot(workspace.id),
  ]);

  const signals: Signal[] = [];
  for (const c of connections.filter((c) => c.status === "error"))
    signals.push({ severity: "critical", section: "connections", title: `${c.displayName} stopped syncing`, detail: c.lastError ?? "Reconnect it on the Connections page." });
  signals.push(...money.signals, ...(marketing.hasData ? marketing.signals : []), ...comm.signals, ...sales.signals, ...people.signals);
  // Worst first; keep "all good" lines only if nothing is wrong anywhere.
  const rank = { critical: 0, warning: 1, good: 2 } as const;
  signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const shown = signals.some((s) => s.severity !== "good") ? signals.filter((s) => s.severity !== "good") : signals;
  const has = (ids: string[]) => connections.some((c) => ids.includes(c.provider));
  const areas = areaHealth(signals, {
    money: has(["stripe", "square", "quickbooks", "xero", "plaid", "csv"]),
    marketing: has(["google-ads", "meta-ads"]),
    communication: has(["outlook", "google-calendar"]),
    sales: has(["hubspot"]),
    people: has(["merge-hris"]),
  });

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
          <h2>Your business at a glance</h2>
          <HealthGrid areas={areas} />
          <h2>Fix these first</h2>
          <Signals signals={shown.slice(0, 5)} />
          {shown.length > 5 && <p className="small muted">{shown.length - 5} more on the section pages.</p>}
          <h2>Money</h2>
          <div className="grid">
            <Stat label="Sales" cents={money.cur.sales} prevCents={money.prev.sales} currency={money.currency} />
            <Stat label="Spending" cents={money.cur.expenses} prevCents={money.prev.expenses} currency={money.currency} goodWhenUp={false} />
            <Stat label="Net" cents={money.cur.net} currency={money.currency} />
          </div>
          {marketing.hasData && (
            <>
              <h2>Marketing</h2>
              <div className="grid">
                <Stat label="Ad spend" cents={marketing.cur.spend} prevCents={marketing.prev.spend} currency={marketing.currency} goodWhenUp={false} />
                <div className="card stat">
                  <div className="label">Sales per $1 of ads</div>
                  <div className="value">{marketing.blendedReturn !== null ? `$${marketing.blendedReturn.toFixed(2)}` : "-"}</div>
                </div>
              </div>
            </>
          )}
          <p className="small muted" style={{ marginTop: 16 }}>
            {connections.length} app{connections.length === 1 ? "" : "s"} connected. Each section adds its own warnings here as you connect more.
          </p>
        </>
      )}
    </>
  );
}
