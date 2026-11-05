import { db } from "@/lib/db";
import { canManage, requireWorkspace } from "@/lib/workspace";
import { phoneConfigured } from "@/lib/twilio";
import { prettyPhone } from "@/lib/twilio-core";
import { fmtDateTime } from "@/lib/dates";
import { BrowserPhone } from "@/components/BrowserPhone";
import { NumberPicker, TextBox } from "@/components/PhoneForms";
import { markThreadRead, releaseNumber } from "./actions";

export default async function PhonePage() {
  const { user, workspace, role } = await requireWorkspace();
  const tz = user.timeZone;
  if (!phoneConfigured())
    return (
      <>
        <h1>Phone</h1>
        <div className="signal warning"><span className="dot" /><div><div className="title">Not set up yet</div><div className="small">Whoever runs this site needs to add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.</div></div></div>
      </>
    );
  const line = await db.phoneLine.findUnique({ where: { workspaceId: workspace.id } });
  if (!line?.number)
    return (
      <>
        <h1>Phone</h1>
        <p className="muted">Get a business number for {workspace.name}. Call and text from this page, and calls ring everyone on the team who has it open.</p>
        {canManage(role) ? <NumberPicker /> : <p>Ask an owner or admin to set up a number.</p>}
        <p className="small muted">A local US number costs about $1.15 a month plus usage. Texting US customers also needs a one-time business registration (A2P 10DLC) with the carriers.</p>
      </>
    );

  const [texts, calls] = await Promise.all([
    db.textMessage.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.callLog.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  // Group texts into conversations, newest conversation first.
  const threads = new Map<string, typeof texts>();
  for (const t of texts) threads.set(t.other, [...(threads.get(t.other) ?? []), t]);
  const convos = [...threads.entries()].slice(0, 20).map(([other, msgs]) => ({ other, msgs: msgs.slice(0, 8).reverse(), unread: msgs.filter((m) => m.direction === "inbound" && !m.readAt).length }));

  return (
    <>
      <h1>Phone</h1>
      <p className="muted">{workspace.name}&apos;s number: <strong>{prettyPhone(line.number)}</strong></p>
      <div className="phone-grid">
        <BrowserPhone />
        <div>
          <h2 style={{ marginTop: 0 }}>Texts</h2>
          <TextBox compose />
          {convos.length === 0 && <p className="small muted">No texts yet.</p>}
          {convos.map((c) => (
            <div key={c.other} className="thread">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>{prettyPhone(c.other)}</strong>
                {c.unread > 0 && (
                  <form action={markThreadRead}><input type="hidden" name="other" value={c.other} /><button className="badge err" style={{ border: 0, cursor: "pointer" }}>{c.unread} new · mark read</button></form>
                )}
              </div>
              <div className="bubbles">
                {c.msgs.map((m) => (
                  <div key={m.id} className={`sms ${m.direction === "outbound" ? "out" : ""}`} title={fmtDateTime(m.createdAt, tz)}>{m.body}</div>
                ))}
              </div>
              <TextBox to={c.other} />
            </div>
          ))}
        </div>
      </div>

      <h2>Recent calls</h2>
      {calls.length === 0 ? <p className="small muted">No calls yet.</p> : (
        <table>
          <thead><tr><th>When</th><th /><th>Number</th><th>Result</th><th /></tr></thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id}>
                <td>{fmtDateTime(c.createdAt, tz)}</td>
                <td>{c.direction === "inbound" ? "In" : "Out"}</td>
                <td>{prettyPhone(c.other)}</td>
                <td>
                  <span className={`badge ${c.status === "completed" ? "ok" : c.status === "voicemail" || c.status === "no-answer" ? "err" : ""}`}>{c.status === "no-answer" ? "missed" : c.status}</span>
                  {c.durationSec ? <span className="small muted"> {Math.round(c.durationSec / 60) || "<1"} min</span> : null}
                </td>
                <td>{c.recordingUrl && <audio controls preload="none" src={`/api/twilio/play/${c.id}`} style={{ height: 32 }} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {role === "owner" && (
        <details style={{ marginTop: 24 }}>
          <summary className="small muted">Give up this number</summary>
          <form action={releaseNumber} className="card danger" style={{ marginTop: 8 }}>
            <p className="small">Releases {prettyPhone(line.number)} and deletes its Twilio account. You may not get the same number back.</p>
            <input type="hidden" name="confirm" value="yes" />
            <button className="btn end">Release number</button>
          </form>
        </details>
      )}
    </>
  );
}
