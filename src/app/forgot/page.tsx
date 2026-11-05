import Link from "next/link";
import { requestReset } from "@/app/auth-actions";
import { SimpleForm } from "@/components/SimpleForm";

export default function ForgotPage() {
  return (
    <div className="auth">
      <h1>Reset your password</h1>
      <p className="muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <SimpleForm action={requestReset} submit="Send reset link" hideOnSuccess>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </SimpleForm>
      <p className="small" style={{ marginTop: 16 }}><Link href="/login">Back to log in</Link></p>
    </div>
  );
}
