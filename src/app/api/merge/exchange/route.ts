import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";
import { runSync } from "@/lib/sync";
import { merge } from "@/connectors/merge-hris";

const Body = z.object({ publicToken: z.string().min(1).max(500) });

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace("admin");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await merge<{ account_token: string; integration?: { name?: string; slug?: string } }>(`/integrations/account-token/${encodeURIComponent(body.data.publicToken)}`);
  const name = r.integration?.name ?? "Payroll";
  const data = { displayName: `${name} (payroll)`, status: "connected", lastError: null, accessTokenEnc: encrypt(r.account_token) };
  const c = await db.connection.upsert({
    where: { workspaceId_provider_externalAccountId: { workspaceId: workspace.id, provider: "merge-hris", externalAccountId: r.integration?.slug ?? name } },
    create: { workspaceId: workspace.id, provider: "merge-hris", externalAccountId: r.integration?.slug ?? name, ...data },
    update: data,
  });
  after(() => runSync(c.id, "manual"));
  return NextResponse.json({ ok: true });
}
