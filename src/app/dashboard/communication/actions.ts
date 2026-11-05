"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { tokenContext } from "@/lib/tokens";
import { liveConnector } from "@/connectors/registry";
import { outlookActions } from "@/connectors/outlook";
import { googleActions } from "@/connectors/google-workspace";

export type ActionState = { error?: string; ok?: string } | undefined;

async function tokenFor(connectionId: string, workspaceId: string) {
  const c = await db.connection.findFirst({ where: { id: connectionId, workspaceId, status: { not: "disconnected" } } });
  if (!c) throw new Error("That account isn't connected anymore.");
  const ctx = await tokenContext(c, liveConnector(c.provider)!);
  if (!ctx.accessToken) throw new Error("Sign-in is missing; reconnect the account.");
  return { c, token: ctx.accessToken };
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export async function replyToEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const p = z.object({ id: z.string(), text: z.string().trim().min(1, "Write a reply first.").max(20000) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const msg = await db.message.findFirst({ where: { id: p.data.id, workspaceId: workspace.id } });
  if (!msg) return { error: "That email is gone. Refresh the page." };
  try {
    const { token } = await tokenFor(msg.connectionId, workspace.id);
    if (msg.source !== "outlook") return { error: "Replies work for Outlook mail so far." };
    await outlookActions.reply(token, msg.externalId, p.data.text);
    await db.message.update({ where: { id: msg.id }, data: { needsReply: false } });
  } catch (e) {
    return { error: errMsg(e) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: "Sent." };
}

export async function markHandled(form: FormData) {
  const { workspace } = await requireWorkspace();
  await db.message.updateMany({ where: { id: String(form.get("id")), workspaceId: workspace.id }, data: { needsReply: false } });
  revalidatePath("/dashboard", "layout");
}

export async function respondToInvite(form: FormData) {
  const { workspace } = await requireWorkspace();
  const ev = await db.calendarEvent.findFirst({ where: { id: String(form.get("id")), workspaceId: workspace.id } });
  const answer = String(form.get("answer"));
  if (!ev || !["accept", "tentative", "decline"].includes(answer)) return;
  const { token } = await tokenFor(ev.connectionId, workspace.id);
  if (ev.source === "outlook") await outlookActions.respond(token, ev.externalId, answer === "accept" ? "accept" : answer === "tentative" ? "tentativelyAccept" : "decline");
  else await googleActions.respond(token, ev.externalId, answer === "accept" ? "accepted" : answer === "tentative" ? "tentative" : "declined");
  await db.calendarEvent.update({ where: { id: ev.id }, data: { myResponse: answer === "accept" ? "accepted" : answer === "tentative" ? "tentative" : "declined" } });
  revalidatePath("/dashboard", "layout");
}

export async function sendEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const { workspace } = await requireWorkspace();
  const p = z.object({
    connectionId: z.string(),
    to: z.string().trim().email("Enter a valid email address."),
    subject: z.string().trim().min(1, "Add a subject.").max(500),
    text: z.string().trim().min(1, "Write a message.").max(50000),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    const { c, token } = await tokenFor(p.data.connectionId, workspace.id);
    if (c.provider === "outlook") await outlookActions.send(token, p.data.to, p.data.subject, p.data.text);
    else if (c.provider === "google-calendar") await googleActions.send(token, c.externalAccountId, p.data.to, p.data.subject, p.data.text);
    else return { error: "That account can't send email." };
  } catch (e) {
    return { error: errMsg(e) };
  }
  return { ok: `Sent to ${p.data.to}.` };
}
