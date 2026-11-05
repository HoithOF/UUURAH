import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { runSync } from "@/lib/sync";
import { liveConnector } from "@/connectors/registry";
import { appUrl } from "@/lib/url";

const back = (q: string) => NextResponse.redirect(appUrl(`/dashboard/connections?${q}`));

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("error=denied");
  if (!code || !stateParam) return back("error=state");

  // The state must exist, be fresh, match this provider and be used by the same person who started it.
  const state = await db.oAuthState.findUnique({ where: { state: stateParam } });
  if (state) await db.oAuthState.delete({ where: { state: stateParam } });
  if (!state || state.provider !== provider || state.userId !== user.id || Date.now() - state.createdAt.getTime() > 15 * 60_000) return back("error=state");

  const connector = liveConnector(provider);
  if (!connector?.exchangeCode || !connector.isConfigured()) return back("error=config");

  let result;
  try {
    result = await connector.exchangeCode(code, appUrl(`/api/connect/${provider}/callback`), url.searchParams);
  } catch (e) {
    console.error(`[connect:${provider}]`, e);
    return back("error=failed");
  }

  const data = {
    displayName: result.displayName,
    status: "connected",
    lastError: null,
    accessTokenEnc: result.accessToken ? encrypt(result.accessToken) : null,
    refreshTokenEnc: result.refreshToken ? encrypt(result.refreshToken) : null,
    tokenExpiresAt: result.tokenExpiresAt ?? null,
    scopes: result.scopes ?? null,
  };
  const connection = await db.connection.upsert({
    where: { workspaceId_provider_externalAccountId: { workspaceId: state.workspaceId, provider, externalAccountId: result.externalAccountId } },
    create: { workspaceId: state.workspaceId, provider, externalAccountId: result.externalAccountId, ...data },
    update: data,
  });

  // First sync runs after the redirect so the owner isn't left waiting on a spinner.
  after(() => runSync(connection.id, "manual"));
  return back("connected=1");
}
