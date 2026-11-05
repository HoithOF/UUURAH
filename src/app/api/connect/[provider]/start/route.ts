import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { randomToken } from "@/lib/crypto";
import { liveConnector } from "@/connectors/registry";
import { appUrl } from "@/lib/url";

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { workspace, user } = await requireWorkspace("admin");
  const connector = liveConnector(provider);
  if (!connector?.authorizeUrl) return NextResponse.redirect(appUrl("/dashboard/connections?error=unknown"));
  if (!connector.isConfigured()) return NextResponse.redirect(appUrl("/dashboard/connections?error=config"));

  const state = randomToken();
  await db.oAuthState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 15 * 60_000) } } });
  await db.oAuthState.create({ data: { state, workspaceId: workspace.id, userId: user.id, provider } });
  return NextResponse.redirect(connector.authorizeUrl(state, appUrl(`/api/connect/${provider}/callback`)));
}
