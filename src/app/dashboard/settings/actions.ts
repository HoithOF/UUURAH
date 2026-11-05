"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { createAccessKey } from "@/lib/access-keys";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { issueToken } from "@/lib/auth-tokens";
import { sendEmail, simpleHtml } from "@/lib/email";
import { appUrl } from "@/lib/url";
import { allow } from "@/lib/rate-limit";
import { encrypt, decrypt, sha256 } from "@/lib/crypto";
import { newRecoveryCodes, newTotpSecret, verifyTotp } from "@/lib/totp";
import { destroyOtherSessions, requireUser } from "@/lib/auth";
import type { FormState } from "@/app/auth-actions";

export type KeyState = { error?: string; key?: string } | undefined;

export async function createKey(_: KeyState, form: FormData): Promise<KeyState> {
  const { user, workspace } = await requireWorkspace("admin");
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Give the key a name, like \"My Claude\"." };
  const active = await db.accessKey.count({ where: { workspaceId: workspace.id, revokedAt: null } });
  if (active >= 10) return { error: "You already have 10 keys. Turn one off first." };
  const key = await createAccessKey(workspace.id, user.id, name);
  revalidatePath("/dashboard/settings");
  return { key };
}

export async function revokeKey(form: FormData) {
  const { workspace } = await requireWorkspace("admin");
  await db.accessKey.updateMany({ where: { id: String(form.get("id")), workspaceId: workspace.id, revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath("/dashboard/settings");
}

// ---- Team ----


const InviteSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), role: z.enum(["member", "admin"]) });

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const { user, workspace, role } = await requireWorkspace("admin");
  const parsed = InviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email } = parsed.data;
  // Only owners can make admins.
  const inviteRole = role === "owner" ? parsed.data.role : "member";
  if (!(await allow(`invite:${workspace.id}`, 20, 3600_000))) return { error: "That's a lot of invites in an hour. Try again later." };
  const already = await db.membership.findFirst({ where: { workspaceId: workspace.id, user: { email } } });
  if (already) return { error: `${email} is already on the team.` };
  // Replace any earlier pending invite for the same address.
  await db.authToken.deleteMany({ where: { kind: "invite", workspaceId: workspace.id, email, usedAt: null } });
  const token = await issueToken("invite", { email, workspaceId: workspace.id, role: inviteRole, invitedById: user.id });
  const url = appUrl(`/invite?token=${token}`);
  await sendEmail({
    to: email,
    subject: `${user.name} invited you to ${workspace.name} on UUURAH`,
    text: `${user.name} invited you to see ${workspace.name}'s dashboard on UUURAH.\n\nAccept here (works for 7 days):\n${url}`,
    html: simpleHtml(`Join ${workspace.name}`, [`${user.name} invited you to see ${workspace.name}'s dashboard on UUURAH.`, "The link works for 7 days."], { label: "Accept invite", url }),
  });
  revalidatePath("/dashboard/settings");
  return { ok: `Invite sent to ${email}.` };
}

export async function revokeInvite(form: FormData) {
  const { workspace } = await requireWorkspace("admin");
  await db.authToken.deleteMany({ where: { id: String(form.get("id")), kind: "invite", workspaceId: workspace.id, usedAt: null } });
  revalidatePath("/dashboard/settings");
}

export async function changeRole(form: FormData) {
  const { user, workspace } = await requireWorkspace("owner");
  const id = String(form.get("id"));
  const newRole = z.enum(["member", "admin"]).parse(form.get("role"));
  await db.membership.updateMany({ where: { id, workspaceId: workspace.id, role: { not: "owner" }, userId: { not: user.id } }, data: { role: newRole } });
  revalidatePath("/dashboard/settings");
}

export async function removeMember(form: FormData) {
  const { user, workspace, role } = await requireWorkspace("admin");
  const id = String(form.get("id"));
  // Owners can remove admins and members; admins can remove members. Nobody removes the owner or themselves here.
  const removable = role === "owner" ? ["admin", "member"] : ["member"];
  await db.membership.deleteMany({ where: { id, workspaceId: workspace.id, role: { in: removable }, userId: { not: user.id } } });
  revalidatePath("/dashboard/settings");
}

// ---- Your account ----

export async function startTwoStep(): Promise<{ secret: string } | { error: string }> {
  const user = await requireUser();
  if (user.totpEnabledAt) return { error: "Two-step login is already on." };
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecretEnc: encrypt(secret) } });
  return { secret };
}

export type TwoStepState = { error?: string; codes?: string[] } | undefined;

export async function confirmTwoStep(_: TwoStepState, form: FormData): Promise<TwoStepState> {
  const user = await requireUser();
  if (!user.totpSecretEnc || user.totpEnabledAt) return { error: "Start again." };
  if (!(await allow(`mfa-setup:${user.id}`, 10, 10 * 60_000))) return { error: "Too many tries. Wait a few minutes." };
  if (!verifyTotp(decrypt(user.totpSecretEnc), String(form.get("code") ?? ""))) return { error: "That code didn't match. Check the time on your phone and try again." };
  const codes = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), recoveryCodes: JSON.stringify(codes.map(sha256)) } });
  // No revalidate here: the page would re-render as "on" and hide the codes before they're saved.
  return { codes };
}

export async function disableTwoStep(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await bcrypt.compare(String(form.get("password") ?? ""), user.passwordHash))) return { error: "That password isn't right." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabledAt: null, totpSecretEnc: null, recoveryCodes: null } });
  revalidatePath("/dashboard/settings");
  return { ok: "Two-step login is off." };
}

export async function signOutOthers(): Promise<FormState> {
  const user = await requireUser();
  await destroyOtherSessions(user.id);
  return { ok: "Signed out of every other device." };
}

export async function setTimeZone(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const tz = String(form.get("timeZone") ?? "");
  if (!Intl.supportedValuesOf("timeZone").includes(tz) && tz !== "UTC") return { error: "Pick a time zone from the list." };
  await db.user.update({ where: { id: user.id }, data: { timeZone: tz } });
  revalidatePath("/dashboard", "layout");
  return { ok: "Saved." };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await allow(`pwchange:${user.id}`, 5, 15 * 60_000))) return { error: "Too many tries. Wait a few minutes." };
  if (!(await bcrypt.compare(String(form.get("current") ?? ""), user.passwordHash))) return { error: "Your current password isn't right." };
  const next = String(form.get("password") ?? "");
  if (next.length < 10 || next.length > 200) return { error: "Use at least 10 characters." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  await destroyOtherSessions(user.id);
  return { ok: "Password changed. Other devices were signed out." };
}
// ---- Danger zone ----

export async function deleteCompany(_: FormState, form: FormData): Promise<FormState> {
  const { user, workspace } = await requireWorkspace("owner");
  if (String(form.get("confirm") ?? "").trim() !== workspace.name) return { error: `Type "${workspace.name}" exactly to confirm.` };
  if (!(await bcrypt.compare(String(form.get("password") ?? ""), user.passwordHash))) return { error: "That password isn't right." };
  // Revoke what we can on the apps' side first; ignore failures (the tokens are deleted regardless).
  const conns = await db.connection.findMany({ where: { workspaceId: workspace.id } });
  const { liveConnector } = await import("@/connectors/registry");
  await Promise.allSettled(conns.map((c) => liveConnector(c.provider)?.disconnect?.(c, { accessToken: c.accessTokenEnc ? decrypt(c.accessTokenEnc) : undefined })));
  await db.$transaction([
    db.moneyTransaction.deleteMany({ where: { workspaceId: workspace.id } }),
    db.invoice.deleteMany({ where: { workspaceId: workspace.id } }),
    db.adMetric.deleteMany({ where: { workspaceId: workspace.id } }),
    db.authToken.deleteMany({ where: { workspaceId: workspace.id } }),
    db.workspace.delete({ where: { id: workspace.id } }),
  ]);
  const left = await db.membership.count({ where: { userId: user.id } });
  if (left === 0) {
    await db.user.delete({ where: { id: user.id } });
    redirect("/");
  }
  redirect("/dashboard");
}

export async function deleteMyAccount(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!(await bcrypt.compare(String(form.get("password") ?? ""), user.passwordHash))) return { error: "That password isn't right." };
  const owned = await db.membership.findMany({ where: { userId: user.id, role: "owner" }, include: { workspace: { include: { _count: { select: { memberships: true } } } } } });
  const shared = owned.filter((m) => m.workspace._count.memberships > 1);
  if (shared.length) return { error: `You own ${shared.map((m) => m.workspace.name).join(", ")}, which has other people in it. Make someone else the owner or delete the company first.` };
  if (owned.length) return { error: `Delete ${owned.map((m) => m.workspace.name).join(", ")} first (Settings → Delete this company). That also deletes your login.` };
  await db.authToken.deleteMany({ where: { OR: [{ userId: user.id }, { email: user.email }] } });
  await db.accessKey.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  redirect("/");
}

export async function transferOwnership(_: FormState, form: FormData): Promise<FormState> {
  const { user, workspace } = await requireWorkspace("owner");
  const to = await db.membership.findFirst({ where: { id: String(form.get("membershipId")), workspaceId: workspace.id, userId: { not: user.id } } });
  if (!to) return { error: "Pick someone on the team." };
  if (!(await bcrypt.compare(String(form.get("password") ?? ""), user.passwordHash))) return { error: "That password isn't right." };
  await db.$transaction([
    db.membership.update({ where: { id: to.id }, data: { role: "owner" } }),
    db.membership.updateMany({ where: { workspaceId: workspace.id, userId: user.id }, data: { role: "admin" } }),
  ]);
  revalidatePath("/dashboard", "layout");
  return { ok: "Ownership moved. You're now an admin." };
}

export async function setAlerts(_: FormState, form: FormData): Promise<FormState> {
  const { user, workspace } = await requireWorkspace();
  const freq = z.enum(["off", "daily", "weekly"]).safeParse(form.get("frequency"));
  if (!freq.success) return { error: "Pick how often." };
  await db.membership.update({ where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } }, data: { alertFrequency: freq.data } });
  return { ok: freq.data === "off" ? "Alerts are off." : `Saved. ${freq.data === "daily" ? "Each morning when something needs attention." : "Every Monday morning."}` };
}
