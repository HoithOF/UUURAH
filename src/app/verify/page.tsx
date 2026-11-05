import Link from "next/link";
import { db } from "@/lib/db";
import { peekToken, useToken } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const row = await peekToken("verify", token);
  let ok = false;
  if (row?.userId && (await useToken(row.id))) {
    // Only confirm if the account still has the email the link was sent to.
    const r = await db.user.updateMany({ where: { id: row.userId, email: row.email }, data: { emailVerifiedAt: new Date() } });
    ok = r.count === 1;
  }
  return (
    <div className="auth">
      <h1>{ok ? "Email confirmed" : "Link expired"}</h1>
      <p>{ok ? "Thanks. You'll get alerts and password resets at this address." : "This link has expired or was already used. You can send a new one from the dashboard."}</p>
      <Link className="btn primary" href="/dashboard">Go to dashboard</Link>
    </div>
  );
}
