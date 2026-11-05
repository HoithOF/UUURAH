import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { marketingSnapshot } from "@/lib/marketing";
import { formatMoney } from "@/lib/metrics-core";
import { catalogFor } from "@/connectors/catalog";
import { Signals } from "@/components/Signals";
import { Stat } from "@/components/Stat";

const SOURCE: Record<string, string> = { "google-ads": "Google", "meta-ads": "Meta" };
const num = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

export default async function MarketingPage() {
  const { workspace } = await requireWorkspace();
  const m = await marketingSnapshot(workspace.id);
  const c = m.currency;

  if (!m.hasData)
    return (
      <>
        <h1>Marketing</h1>
        <p className="muted">See whether your ad money is working: spend, results and return on ad spend from every ad platform, next to your real sales.</p>
        <div className="list" style={{ marginTop: 16 }}>
          {catalogFor("marketing").map((a) => (
            <div className="app-row" key={a.id}>
              <div><strong>{a.name}</strong><div className="small muted">{a.blurb}</div></div>
              <span className="badge">{a.available ? "Ready to connect" : `Wave ${a.wave}`}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16 }}><Link className="btn primary" href="/dashboard/connections">Connect ad accounts</Link></p>
      </>
    );

  return (
    <>
      <h1>Marketing</h1>
      <p className="muted">Last 30 days across every connected ad account.</p>
      <div className="grid" style={{ marginTop: 16 }}>
        <Stat label="Ad spend" cents={m.cur.spend} prevCents={m.prev.spend} currency={c} goodWhenUp={false} />
        <div className="card stat">
          <div className="label">Conversions</div>
          <div className="value">{num(m.cur.conversions)}</div>
          <div className="small muted">{m.cur.costPerConversion !== null ? `${formatMoney(Math.round(m.cur.costPerConversion), c)} each` : "No conversions tracked"}</div>
        </div>
        <div className="card stat">
          <div className="label">Return per $1 (platforms say)</div>
          <div className="value">{m.cur.roas !== null ? formatMoney(Math.round(m.cur.roas * 100), c) : "-"}</div>
          <div className="small muted">From conversion values the ad platforms report</div>
        </div>
        <div className="card stat">
          <div className="label">Sales per $1 of ads (real)</div>
          <div className="value">{m.blendedReturn !== null ? formatMoney(Math.round(m.blendedReturn * 100), c) : "-"}</div>
          <div className="small muted">All sales from your money apps divided by ad spend</div>
        </div>
      </div>

      <h2>Signals</h2>
      <Signals signals={m.signals} />

      <h2>Campaigns</h2>
      <table>
        <thead><tr><th>Campaign</th><th>Where</th><th className="num">Spend</th><th className="num">Clicks</th><th className="num">Conversions</th><th className="num">Cost each</th><th className="num">Return per $1</th></tr></thead>
        <tbody>
          {m.campaigns.map((x) => (
            <tr key={`${x.source}${x.campaignId}`}>
              <td>{x.name}</td>
              <td>{SOURCE[x.source] ?? x.source}</td>
              <td className="num">{formatMoney(x.spend, c)}</td>
              <td className="num">{num(x.clicks)}</td>
              <td className={`num ${x.conversions === 0 && x.spend >= 10000 ? "down" : ""}`}>{num(x.conversions)}</td>
              <td className="num">{x.costPerConversion !== null ? formatMoney(Math.round(x.costPerConversion), c) : "-"}</td>
              <td className={`num ${x.roas !== null && x.roas < 1 ? "down" : ""}`}>{x.roas !== null ? formatMoney(Math.round(x.roas * 100), c) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
