import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { peekToken } from "@/lib/auth-tokens";
import { acceptInviteExisting, acceptInviteNew } from "@/app/auth-actions";
import { SimpleForm } from "@/components/SimpleForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const invite = await peekToken("invite", token);
  if (!invite?.workspaceId)
    return (
      <div className="auth">
        <h1>Invite expired</h1>
        <p>This invite has expired or was already used. Ask whoever invited you to send a new one.</p>
      </div>
    );
  const [workspace, user, existing] = await Promise.all([
    db.workspace.findUnique({ where: { id: invite.workspaceId } }),
    getCurrentUser(),
    db.user.findUnique({ where: { email: invite.email }, select: { id: true } }),
  ]);
  const here = `/invite?token=${encodeURIComponent(token!)}`;
  return (
    <div className="auth">
      <h1>Join {workspace?.name}</h1>
      <p className="muted">You&apos;ve been invited as {invite.role === "admin" ? "an admin" : "a team member"}.</p>
      {user ? (
        <SimpleForm action={acceptInviteExisting} submit="Accept invite">
          <p>Signed in as {user.email}.</p>
          <input type="hidden" name="token" value={token} />
        </SimpleForm>
      ) : existing ? (
        <p><Link className="btn primary" href={`/login?next=${encodeURIComponent(here)}`}>Log in to accept</Link></p>
      ) : (
        <SimpleForm action={acceptInviteNew} submit="Create account and join">
          <input type="hidden" name="token" value={token} />
          <label>Email</label>
          <input type="email" value={invite.email} disabled />
          <label htmlFor="name">Your name</label>
          <input id="name" name="name" type="text" autoComplete="name" required />
          <label htmlFor="password">Choose a password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </SimpleForm>
      )}
    </div>
  );
}
