import { db } from "@/lib/db";
import { canManage, requireWorkspace } from "@/lib/workspace";
import { CATALOG, SECTION_LABELS, type Section } from "@/connectors/catalog";
import { liveConnector } from "@/connectors/registry";
import { UploadForm } from "@/components/UploadForm";
import { PlaidConnect } from "@/components/PlaidConnect";
import { disconnect, syncNow } from "./actions";

function ago(d: Date | null) {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
}

const ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled, so nothing was connected.",
  state: "That sign-in link expired. Try connecting again.",
  config: "This app isn't set up on the server yet (missing API credentials).",
  failed: "The app refused the connection. Try again in a minute.",
};

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { workspace, role } = await requireWorkspace();
  const sp = await searchParams;
  const manage = canManage(role);
  const connections = await db.connection.findMany({ where: { workspaceId: workspace.id, status: { not: "disconnected" } }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <h1>Connections</h1>
      <p className="muted">Sign in to the apps you already use. We only ask for read access, store sign-ins encrypted, and you can disconnect any time.</p>
      {sp.error && <div className="error">{ERRORS[sp.error] ?? "Something went wrong connecting that app."}</div>}
      {sp.connected && <div className="notice">Connected. Your data is syncing now.</div>}
      {!manage && <div className="notice">Only owners and admins can add or remove connections.</div>}

      <h2>Connected</h2>
      {connections.length === 0 ? (
        <p className="muted">Nothing connected yet.</p>
      ) : (
        <div className="list">
          {connections.map((c) => (
            <div className="app-row" key={c.id}>
              <div>
                <strong>{c.displayName}</strong> <span className={`badge ${c.status === "error" ? "err" : "ok"}`}>{c.status === "error" ? "Needs attention" : "Connected"}</span>
                <div className="small muted">{CATALOG.find((x) => x.id === c.provider)?.name} · last updated {ago(c.lastSyncedAt)}{c.lastError ? ` · ${c.lastError}` : ""}</div>
              </div>
              {manage && (
                <div style={{ display: "flex", gap: 8 }}>
                  {liveConnector(c.provider) && (
                    <form action={syncNow}><input type="hidden" name="id" value={c.id} /><button className="btn">Sync now</button></form>
                  )}
                  <form action={disconnect}><input type="hidden" name="id" value={c.id} /><button className="btn danger">Disconnect</button></form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(Object.keys(SECTION_LABELS) as Section[]).map((section) => (
        <section key={section}>
          <h2>{SECTION_LABELS[section]}</h2>
          <div className="list">
            {CATALOG.filter((a) => a.section === section).map((a) => {
              const live = liveConnector(a.id);
              return (
                <div className="app-row" key={a.id}>
                  <div style={{ flex: 1 }}>
                    <strong>{a.name}</strong>
                    <div className="small muted">{a.blurb}</div>
                    {a.id === "csv" && manage && <div style={{ marginTop: 10 }}><UploadForm /></div>}
                  </div>
                  {a.id === "csv" ? null : !a.available ? (
                    <span className="badge">Wave {a.wave}</span>
                  ) : live?.isConfigured() && manage ? (
                    live.connectVia === "plaid-link" ? <PlaidConnect /> : <a className="btn primary" href={`/api/connect/${a.id}/start`}>Connect {a.name}</a>
                  ) : (
                    <span className="badge" title="Add the API credentials in the server's environment">{manage ? "Needs server setup" : "Available"}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
