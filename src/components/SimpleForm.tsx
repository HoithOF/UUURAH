"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/auth-actions";

/** A form wired to a server action, with error/success messages and a pending button. */
export function SimpleForm({
  action,
  submit,
  pendingLabel = "One moment...",
  children,
  className,
  hideOnSuccess = false,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submit: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  className?: string;
  hideOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (hideOnSuccess && state?.ok) return <div className="note" role="status">{state.ok}</div>;
  return (
    <form action={formAction} className={className}>
      {state?.error && <div className="error" role="alert">{state.error}</div>}
      {state?.ok && <div className="note" role="status">{state.ok}</div>}
      {children}
      <div style={{ marginTop: 16 }}>
        <button className="btn primary" disabled={pending}>{pending ? pendingLabel : submit}</button>
      </div>
    </form>
  );
}
