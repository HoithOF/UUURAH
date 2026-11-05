import Link from "next/link";
import { resetPassword } from "@/app/auth-actions";
import { peekToken } from "@/lib/auth-tokens";
import { SimpleForm } from "@/components/SimpleForm";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const row = await peekToken("reset", token);
  return (
    <div className="auth">
      <h1>Choose a new password</h1>
      {!row ? (
        <p>This link has expired or was already used. <Link href="/forgot">Ask for a new one.</Link></p>
      ) : (
        <SimpleForm action={resetPassword} submit="Save password">
          <p className="muted">For {row.email}. You&apos;ll be signed out on every other device.</p>
          <input type="hidden" name="token" value={token} />
          <label htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </SimpleForm>
      )}
    </div>
  );
}
