"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/auth-actions";

export function AuthForm({ mode, action, next }: { mode: "login" | "signup"; action: (s: FormState, f: FormData) => Promise<FormState>; next?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="auth">
      <h1>{mode === "login" ? "Log in" : "Create your company account"}</h1>
      <p className="muted">{mode === "login" ? "Welcome back." : "Connect your apps and see your whole business in one place."}</p>
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <>
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
          <label htmlFor="company">Company name</label>
          <input id="company" name="company" type="text" autoComplete="organization" required />
        </>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 10 : undefined} required />
      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <button className="btn primary" disabled={pending}>{pending ? "One moment..." : mode === "login" ? "Log in" : "Create account"}</button>
        {mode === "login" ? <Link href="/signup">Create an account</Link> : <Link href="/login">I already have an account</Link>}
      </div>
      {mode === "login" && <p className="small" style={{ marginTop: 16 }}><Link href="/forgot">Forgot your password?</Link></p>}
      {mode === "signup" && <p className="small muted" style={{ marginTop: 16 }}>By creating an account you agree to our <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p>}
    </form>
  );
}
