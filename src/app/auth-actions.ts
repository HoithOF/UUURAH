"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { decrypt, sha256 } from "@/lib/crypto";
import { allow, clearHits, clientIp } from "@/lib/rate-limit";
import { issueToken, peekToken, useToken } from "@/lib/auth-tokens";
import { sendEmail, simpleHtml } from "@/lib/email";
import { verifyTotp } from "@/lib/totp";
import { appUrl } from "@/lib/url";
import { TRIAL_DAYS } from "@/lib/billing";

export type FormState = { error?: string; ok?: string } | undefined;

const Password = z.string().min(10, "Use at least 10 characters").max(200);
const Email = z.string().trim().toLowerCase().email("Enter a valid email");
const TOO_MANY = "Too many tries. Wait a few minutes and try again.";
const MFA_COOKIE = "mfa_pending";

export async function sendVerifyEmail(userId: string, email: string, name: string) {
  const token = await issueToken("verify", { email, userId });
  const url = appUrl(`/verify?token=${token}`);
  await sendEmail({
    to: email,
    subject: "Confirm your email for UUURAH",
    text: `Hi ${name},\n\nConfirm your email so we can send you alerts and password resets:\n${url}\n\nThis link works for 7 days.`,
    html: simpleHtml("Confirm your email", [`Hi ${name},`, "Confirm your email so we can send you alerts and password resets. This link works for 7 days."], { label: "Confirm email", url }),
  });
}

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  company: z.string().trim().min(1, "Enter your company name").max(100),
  email: Email,
  password: Password,
});

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await allow(`signup:ip:${await clientIp()}`, 5, 3600_000))) return { error: TOO_MANY };
  const { name, company, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with that email already exists. Log in instead." };
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { name, email, passwordHash, memberships: { create: { role: "owner", workspace: { create: { name: company, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5) } } } } },
  });
  await sendVerifyEmail(user.id, email, name).catch((e) => console.error("verify email failed", e));
  await createSession(user.id);
  redirect("/dashboard");
}

const LoginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1), next: z.string().optional() });
// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password", 12));
// Only same-site paths, so a crafted link can't bounce people to another site after login.
const safeNext = (n?: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password." };
  const { email, password, next } = parsed.data;
  const ip = await clientIp();
  if (!(await allow(`login:email:${email}`, 10, 15 * 60_000)) || !(await allow(`login:ip:${ip}`, 30, 15 * 60_000))) return { error: TOO_MANY };
  const user = await db.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) return { error: "That email and password don't match." };
  await clearHits(`login:email:${email}`);
  if (user.totpEnabledAt) {
    const token = await issueToken("mfa", { email, userId: user.id });
    (await cookies()).set(MFA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
    redirect(`/login/two-step?next=${encodeURIComponent(safeNext(next))}`);
  }
  await createSession(user.id);
  redirect(safeNext(next));
}

export async function verifyTwoStep(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const pending = await peekToken("mfa", jar.get(MFA_COOKIE)?.value);
  if (!pending?.userId) return { error: "That took too long. Log in again." };
  if (!(await allow(`mfa:${pending.userId}`, 6, 10 * 60_000))) return { error: TOO_MANY };
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user?.totpSecretEnc) return { error: "Log in again." };
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  let ok = verifyTotp(decrypt(user.totpSecretEnc), code);
  if (!ok && /^[a-z2-7]{5}-[a-z2-7]{5}$/.test(code)) {
    const hashes: string[] = JSON.parse(user.recoveryCodes ?? "[]");
    const left = hashes.filter((h) => h !== sha256(code));
    if (left.length < hashes.length) {
      ok = true;
      await db.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(left) } });
    }
  }
  if (!ok) return { error: "That code didn't work. Check your authenticator app and try again." };
  if (!(await useToken(pending.id))) return { error: "Log in again." };
  jar.delete(MFA_COOKIE);
  await clearHits(`mfa:${user.id}`);
  await createSession(user.id);
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const email = Email.safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const done = { ok: "If that email has an account, a reset link is on its way. It works for one hour." };
  if (!(await allow(`reset:email:${email.data}`, 3, 3600_000)) || !(await allow(`reset:ip:${await clientIp()}`, 10, 3600_000))) return done;
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (user) {
    const token = await issueToken("reset", { email: user.email, userId: user.id });
    const url = appUrl(`/reset?token=${token}`);
    await sendEmail({
      to: user.email,
      subject: "Reset your UUURAH password",
      text: `Hi ${user.name},\n\nUse this link to choose a new password. It works for one hour:\n${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      html: simpleHtml("Reset your password", [`Hi ${user.name},`, "Use the button below to choose a new password. It works for one hour.", "If you didn't ask for this, you can ignore this email."], { label: "Choose a new password", url }),
    }).catch((e) => console.error("reset email failed", e));
  }
  return done;
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const row = await peekToken("reset", String(form.get("token") ?? ""));
  if (!row?.userId) return { error: "This link has expired or was already used. Ask for a new one." };
  const pw = Password.safeParse(form.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  if (!(await useToken(row.id))) return { error: "This link was already used." };
  await db.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(pw.data, 12), emailVerifiedAt: new Date() } });
  // A reset means the old password may be known to someone else: sign out everywhere.
  await db.session.deleteMany({ where: { userId: row.userId } });
  await clearHits(`login:email:${row.email}`);
  await createSession(row.userId);
  redirect("/dashboard");
}

export async function resendVerification(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.emailVerifiedAt) return { ok: "Your email is already confirmed." };
  if (!(await allow(`verify:${user.id}`, 3, 3600_000))) return { error: TOO_MANY };
  await sendVerifyEmail(user.id, user.email, user.name);
  return { ok: `Sent. Check ${user.email}.` };
}

const InviteSignup = z.object({ token: z.string(), name: z.string().trim().min(1, "Enter your name").max(100), password: Password });

/** New person accepting an invite: creates their account and joins the company. */
export async function acceptInviteNew(_: FormState, form: FormData): Promise<FormState> {
  const parsed = InviteSignup.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const invite = await peekToken("invite", parsed.data.token);
  if (!invite?.workspaceId) return { error: "This invite has expired or was already used. Ask for a new one." };
  if (await db.user.findUnique({ where: { email: invite.email } })) return { error: "You already have an account. Log in to accept." };
  if (!(await useToken(invite.id))) return { error: "This invite was already used." };
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: invite.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      emailVerifiedAt: new Date(), // they clicked a link sent to this address
      memberships: { create: { role: invite.role ?? "member", workspaceId: invite.workspaceId } },
    },
  });
  await createSession(user.id);
  (await cookies()).set("workspace", invite.workspaceId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/dashboard");
}

/** Signed-in person accepting an invite sent to their own email. */
export async function acceptInviteExisting(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const invite = await peekToken("invite", String(form.get("token") ?? ""));
  if (!invite?.workspaceId) return { error: "This invite has expired or was already used." };
  if (invite.email !== user.email) return { error: `This invite was sent to ${invite.email}. Log in with that email to accept it.` };
  if (!(await useToken(invite.id))) return { error: "This invite was already used." };
  await db.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role ?? "member" },
    update: {},
  });
  (await cookies()).set("workspace", invite.workspaceId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
