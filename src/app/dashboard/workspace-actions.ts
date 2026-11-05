"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function switchWorkspace(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("workspaceId"));
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: id } } });
  if (m) (await cookies()).set("workspace", id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/dashboard");
}
