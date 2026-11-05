"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
import { checkoutUrl, portalUrl } from "@/lib/billing";

export async function subscribe() {
  const { user, workspace } = await requireWorkspace("owner");
  redirect(await checkoutUrl(workspace.id, user.email));
}

export async function manageBilling() {
  const { workspace } = await requireWorkspace("owner");
  redirect(await portalUrl(workspace.id));
}
