"use client";

import { useActionState, useRef, useEffect } from "react";
import { findNumbers, getNumber, text, type SearchState, type TextState } from "@/app/dashboard/phone/actions";

export function NumberPicker() {
  const [state, action, pending] = useActionState<SearchState, FormData>(findNumbers, undefined);
  return (
    <div className="card">
      <form action={action} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="area" style={{ marginTop: 0 }}>Area code</label>
          <input id="area" name="areaCode" type="text" inputMode="numeric" maxLength={3} placeholder="512" required style={{ width: 120 }} />
        </div>
        <button className="btn primary" disabled={pending}>{pending ? "Looking..." : "Find numbers"}</button>
      </form>
      {state?.error && <div className="error small">{state.error}</div>}
      {state?.numbers && (
        <table style={{ marginTop: 12 }}>
          <tbody>
            {state.numbers.map((n) => (
              <tr key={n.phone_number}>
                <td>{n.friendly_name}</td>
                <td className="muted">{[n.locality, n.region].filter(Boolean).join(", ")}</td>
                <td><form action={getNumber}><input type="hidden" name="phoneNumber" value={n.phone_number} /><button className="btn">Use this number</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TextBox({ to, compose = false }: { to?: string; compose?: boolean }) {
  const [state, action, pending] = useActionState<TextState, FormData>(text, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form action={action} ref={ref} className="textbox">
      {compose ? <input name="to" type="tel" placeholder="To: (512) 555-0134" required aria-label="Phone number" /> : <input type="hidden" name="to" value={to} />}
      <div style={{ display: "flex", gap: 8 }}>
        <input name="body" type="text" placeholder="Text message" required maxLength={1600} aria-label="Message" style={{ flex: 1 }} />
        <button className="btn primary" disabled={pending}>{pending ? "..." : "Send"}</button>
      </div>
      {state?.error && <div className="error small">{state.error}</div>}
    </form>
  );
}
