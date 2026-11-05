"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { confirmTwoStep, startTwoStep, type TwoStepState } from "@/app/dashboard/settings/actions";

export function TwoStepSetup({ email }: { email: string }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const [state, action, pending] = useActionState<TwoStepState, FormData>(confirmTwoStep, undefined);

  async function begin() {
    const r = await startTwoStep();
    if ("error" in r) return setErr(r.error);
    const uri = `otpauth://totp/${encodeURIComponent(`UUURAH:${email}`)}?secret=${r.secret}&issuer=UUURAH&algorithm=SHA1&digits=6&period=30`;
    setSetup({ secret: r.secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 180 }) });
  }

  if (state?.codes)
    return (
      <div className="card">
        <div className="note">Two-step login is on.</div>
        <p className="small">Save these recovery codes somewhere safe. Each one works once if you lose your phone. They won&apos;t be shown again.</p>
        <pre style={{ columns: 2, fontSize: 14 }}>{state.codes.join("\n")}</pre>
        <button className="btn primary" onClick={() => router.refresh()}>I saved them</button>
      </div>
    );
  if (!setup)
    return (
      <>
        {err && <div className="error">{err}</div>}
        <button className="btn" onClick={begin}>Turn on two-step login</button>
      </>
    );
  return (
    <form action={action} className="card">
      <p className="small">1. Scan this with an authenticator app (Google Authenticator, 1Password, Authy).</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} />
      <p className="small muted">Can&apos;t scan? Type this key: <code>{setup.secret.match(/.{1,4}/g)!.join(" ")}</code></p>
      <label htmlFor="code">2. Enter the 6-digit code it shows</label>
      <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
      {state?.error && <div className="error">{state.error}</div>}
      <div style={{ marginTop: 12 }}><button className="btn primary" disabled={pending}>{pending ? "Checking..." : "Turn on"}</button></div>
    </form>
  );
}
