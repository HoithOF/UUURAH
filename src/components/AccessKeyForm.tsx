"use client";

import { useActionState } from "react";
import { createKey, type KeyState } from "@/app/dashboard/settings/actions";

export function AccessKeyForm() {
  const [state, action, pending] = useActionState<KeyState, FormData>(createKey, undefined);
  return (
    <form action={action} className="card" style={{ marginTop: 12 }}>
      <label htmlFor="keyname">Name this key</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="keyname" type="text" name="name" placeholder="My Claude" maxLength={60} required style={{ flex: 1 }} />
        <button className="btn primary" disabled={pending}>{pending ? "Creating..." : "Create key"}</button>
      </div>
      {state?.error && <div className="error small">{state.error}</div>}
      {state?.key && (
        <div style={{ marginTop: 10 }}>
          <div className="small">Copy this key now. It won&apos;t be shown again.</div>
          <code style={{ display: "block", padding: 10, marginTop: 4, overflowWrap: "anywhere", background: "var(--bg)", borderRadius: 8 }}>{state.key}</code>
        </div>
      )}
    </form>
  );
}
