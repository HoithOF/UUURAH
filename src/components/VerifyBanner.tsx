"use client";

import { useActionState } from "react";
import { resendVerification, type FormState } from "@/app/auth-actions";

export function VerifyBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(() => resendVerification(), undefined);
  return (
    <form action={action} className="banner">
      <span>Confirm your email ({email}) so you can get alerts and reset your password.</span>
      {state?.ok ? <span className="small">{state.ok}</span> : <button className="btn" disabled={pending}>{pending ? "Sending..." : "Resend link"}</button>}
      {state?.error && <span className="small">{state.error}</span>}
    </form>
  );
}
