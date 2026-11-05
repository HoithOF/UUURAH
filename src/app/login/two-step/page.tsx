import Link from "next/link";
import { verifyTwoStep } from "@/app/auth-actions";
import { SimpleForm } from "@/components/SimpleForm";

export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="auth">
      <h1>Enter your code</h1>
      <p className="muted">Open your authenticator app and type the 6-digit code for UUURAH. Lost your phone? Use one of your recovery codes instead.</p>
      <SimpleForm action={verifyTwoStep} submit="Continue" pendingLabel="Checking...">
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <label htmlFor="code">Code</label>
        <input id="code" name="code" type="text" inputMode="text" autoComplete="one-time-code" autoFocus required maxLength={11} />
      </SimpleForm>
      <p className="small" style={{ marginTop: 16 }}><Link href="/login">Start over</Link></p>
    </div>
  );
}
