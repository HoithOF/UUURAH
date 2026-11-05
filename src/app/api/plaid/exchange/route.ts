import { NextResponse, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";
import { runSync } from "@/lib/sync";
import { plaid } from "@/connectors/plaid";

const Body = z.object({ publicToken: z.string().min(1).max(500), institution: z.string().max(200).optional() });

// Step 2: Link hands the browser a one-time public token; we swap it for the long-lived
// access token server-side, encrypt it, and start the first sync.
export async function POST(req: Request) {
  const { workspace } = await requireWorkspace("admin");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: body.data.publicToken });
  const data = { displayName: body.data.institution || "Bank account", status: "connected", lastError: null, accessTokenEnc: encrypt(r.access_token), syncCursor: null };
  const c = await db.connection.upsert({
    where: { workspaceId_provider_externalAccountId: { workspaceId: workspace.id, provider: "plaid", externalAccountId: r.item_id } },
    create: { workspaceId: workspace.id, provider: "plaid", externalAccountId: r.item_id, ...data },
    update: data,
  });
  after(() => runSync(c.id, "manual"));
  return NextResponse.json({ ok: true });
}
