import "server-only";
import type { Connection } from "@prisma/client";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import type { LiveConnector, SyncContext } from "@/connectors/types";

// Refresh a little before expiry. QuickBooks tokens last 1 hour, Square's 30 days.
const REFRESH_WINDOW_MS = 10 * 60_000;

// Decrypts the connection's token, refreshing and re-saving it first when it is
// expired or about to expire.
export async function tokenContext(connection: Connection, connector: LiveConnector): Promise<SyncContext> {
  const cursor = connection.syncCursor ?? undefined;
  if (!connection.accessTokenEnc) return { cursor };
  const expiring = connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() - Date.now() < REFRESH_WINDOW_MS;
  if (!expiring || !connector.refresh || !connection.refreshTokenEnc) return { accessToken: decrypt(connection.accessTokenEnc), cursor };

  const t = await connector.refresh(decrypt(connection.refreshTokenEnc), connection);
  await db.connection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encrypt(t.accessToken),
      refreshTokenEnc: t.refreshToken ? encrypt(t.refreshToken) : connection.refreshTokenEnc,
      tokenExpiresAt: t.tokenExpiresAt ?? null,
    },
  });
  return { accessToken: t.accessToken, cursor };
}
