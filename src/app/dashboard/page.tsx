import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { businessHealth } from "@/lib/health";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";
import { HealthGrid } from "@/components/HealthGrid";

export default async function Overview() {
  const { workspace, user } = await requireWorkspace();
  const { connections, money, marketing, problems: shown, areas } = await businessHealth(workspace.id);

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
