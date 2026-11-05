"use client";

import { useActionState, useState } from "react";
import { replyToEmail, sendEmail, type ActionState } from "@/app/dashboard/communication/actions";

export function ReplyBox({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(replyToEmail, undefined);
  if (state?.ok) return <span className="badge ok">Replied</span>;
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Reply</button>;
  return (
    <form action={action} style={{ width: "100%", marginTop: 8 }}>
      <input type="hidden" name="id" value={id} />
      <textarea name="text" rows={4} required autoFocus style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", font: "inherit" }} />
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn primary" disabled={pending}>{pending ? "Sending..." : "Send reply"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state?.error && <div className="error small">{state.error}</div>}
    </form>
  );
}

export function ComposeEmail({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendEmail, undefined);
  return (
    <form action={action} className="card">
      <label htmlFor="from">From</label>
      <select id="from" name="connectionId" className="btn" style={{ width: "100%" }}>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <label htmlFor="to">To</label>
      <input id="to" name="to" type="email" required />
      <label htmlFor="subject">Subject</label>
      <input id="subject" name="subject" type="text" required />
      <label htmlFor="text">Message</label>
      <textarea id="text" name="text" rows={6} required style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", font: "inherit" }} />
      <div style={{ marginTop: 10 }}><button className="btn primary" disabled={pending}>{pending ? "Sending..." : "Send"}</button></div>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && <div className="notice">{state.ok}</div>}
    </form>
  );
}
