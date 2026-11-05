"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { createAccessKey } from "@/lib/access-keys";

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
