import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./auth";

export type Role = "owner" | "admin" | "member";
const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };
const WS_COOKIE = "workspace";

// The signed-in user plus the company they are looking at. Every data query
// must be scoped by the returned workspace.id.
export async function requireWorkspace(minRole: Role = "member") {
  const user = await requireUser();
  const memberships = await db.membership.findMany({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/signup");
  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const membership = memberships.find((m) => m.workspaceId === wanted) ?? memberships[0];
  const role = membership.role as Role;
  if (RANK[role] < RANK[minRole]) throw new Error("You don't have permission to do that.");
  return { user, workspace: membership.workspace, role, memberships };
}

export function canManage(role: Role) {
  return RANK[role] >= RANK.admin;
}
