import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { commSnapshot } from "@/lib/communication";
import { catalogFor } from "@/connectors/catalog";
import { Signals } from "@/components/Signals";
import { ComposeEmail, ReplyBox } from "@/components/CommForms";
import { markHandled, respondToInvite } from "./actions";

function when(d: Date) {
  const h = Math.round((Date.now() - d.getTime()) / 3600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
const dayLabel = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default async function CommunicationPage() {
  const { workspace } = await requireWorkspace();
  const c = await commSnapshot(workspace.id);
  const senders = await db.connection.findMany({ where: { workspaceId: workspace.id, provider: { in: ["outlook", "google-calendar"] }, status: { not: "disconnected" } }, select: { id: true, displayName: true } });

  if (!c.connected)
    return (
      <>
        <h1>Communication</h1>
        <p className="muted">Your inbox and calendar in one place, with unanswered customers flagged and replies sent from here.</p>
        <div className="list" style={{ marginTop: 16 }}>
          {catalogFor("communication").map((a) => (
            <div className="app-row" key={a.id}>
              <div><strong>{a.name}</strong><div className="small muted">{a.blurb}</div></div>
              <span className="badge">{a.available ? "Ready to connect" : `Wave ${a.wave}`}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16 }}><Link className="btn primary" href="/dashboard/connections">Connect mail and calendar</Link></p>
      </>
    );

  const byDay = new Map<string, typeof c.events>();
  for (const e of c.events) {
    const k = dayLabel(e.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  return (
    <>
      <h1>Communication</h1>
      <p className="muted">Times are shown in UTC for now.</p>
      {c.signals.length > 0 && (<><h2>Signals</h2><Signals signals={c.signals} /></>)}

      <h2>Waiting for your reply ({c.waiting.length})</h2>
      {c.waiting.length === 0 ? (
        <p className="muted">Nobody is waiting on you. Nice.</p>
      ) : (
        <div className="list">
          {c.waiting.map((m) => (
            <div className="app-row" key={m.id} style={{ flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <strong>{m.fromName ?? m.fromEmail}</strong> <span className="small muted">{when(m.receivedAt)}</span>
                <div>{m.subject ?? "(no subject)"}</div>
                <div className="small muted">{m.preview}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {m.source === "outlook" && <ReplyBox id={m.id} />}
                {m.webLink && <a className="btn" href={m.webLink} target="_blank" rel="noopener noreferrer">Open</a>}
                <form action={markHandled}><input type="hidden" name="id" value={m.id} /><button className="btn">Handled</button></form>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Next 7 days</h2>
      {c.events.length === 0 ? <p className="muted">Nothing scheduled.</p> : [...byDay.entries()].map(([day, evs]) => (
        <div key={day} style={{ marginBottom: 16 }}>
          <div className="small muted" style={{ fontWeight: 600, margin: "8px 0" }}>{day}</div>
          <div className="list">
            {evs.map((e) => (
              <div className="app-row" key={e.id}>
                <div>
                  <strong>{e.title}</strong>
                  <div className="small muted">{e.allDay ? "All day" : `${time(e.startsAt)} to ${time(e.endsAt)}`}{e.location ? ` · ${e.location}` : ""}{e.organizer && e.myResponse !== "organizer" ? ` · from ${e.organizer}` : ""}</div>
                </div>
                {e.myResponse === "needsAction" ? (
                  <form action={respondToInvite} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="btn primary" name="answer" value="accept">Accept</button>
                    <button className="btn" name="answer" value="tentative">Maybe</button>
                    <button className="btn danger" name="answer" value="decline">Decline</button>
                  </form>
                ) : (
                  <span className={`badge ${e.myResponse === "declined" ? "err" : e.myResponse === "accepted" || e.myResponse === "organizer" ? "ok" : ""}`}>{e.myResponse === "organizer" ? "Yours" : e.myResponse ?? ""}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {senders.length > 0 && (<><h2>Send an email</h2><ComposeEmail accounts={senders.map((s) => ({ id: s.id, name: s.displayName }))} /></>)}
    </>
  );
}
