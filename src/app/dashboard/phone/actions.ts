"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { allow } from "@/lib/rate-limit";
import { buyNumber, closeLine, searchNumbers, sendText, type AvailableNumber } from "@/lib/twilio";

export type SearchState = { error?: string; numbers?: AvailableNumber[] } | undefined;
export type TextState = { error?: string; ok?: string } | undefined;

export async function findNumbers(_: SearchState, form: FormData): Promise<SearchState> {
  const { workspace } = await requireWorkspace("admin");
  const area = String(form.get("areaCode") ?? "").trim();
  if (!/^\d{3}$/.test(area)) return { error: "Enter a 3-digit area code." };
  try {
    const numbers = await searchNumbers(workspace.id, workspace.name, area);
    return numbers.length ? { numbers } : { error: "No numbers free in that area code. Try a nearby one." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function getNumber(form: FormData) {
  const { workspace } = await requireWorkspace("admin");
  await buyNumber(workspace.id, workspace.name, String(form.get("phoneNumber")));
  revalidatePath("/dashboard/phone");
}

export async function releaseNumber(form: FormData) {
  const { workspace } = await requireWorkspace("owner");
  if (String(form.get("confirm")) !== "yes") return;
  await closeLine(workspace.id);
  revalidatePath("/dashboard/phone");
}

export async function text(_: TextState, form: FormData): Promise<TextState> {
  const { user, workspace } = await requireWorkspace();
  const to = String(form.get("to") ?? "");
  const body = String(form.get("body") ?? "").trim();
  if (!body) return { error: "Write a message." };
  if (body.length > 1600) return { error: "That's too long for a text." };
  if (!(await allow(`sms:${workspace.id}`, 200, 3600_000))) return { error: "Too many texts this hour." };
  try {
    await sendText(workspace.id, user.id, to, body);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/dashboard/phone");
  return { ok: "Sent" };
}

export async function markThreadRead(form: FormData) {
  const { workspace } = await requireWorkspace();
  await db.textMessage.updateMany({ where: { workspaceId: workspace.id, other: String(form.get("other")), readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard/phone");
}
