import "server-only";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

const PREFIX = "uuk_";

export async function createAccessKey(workspaceId: string, userId: string, name: string) {
  const key = PREFIX + randomToken(32);
  await db.accessKey.create({ data: { workspaceId, userId, name, keyHash: sha256(key), lastFour: key.slice(-4) } });
  return key;
}

/** Resolves a bearer key to its workspace, or null. The key's creator must still belong to the workspace. */
export async function workspaceForKey(header: string | null) {
  const key = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key?.startsWith(PREFIX)) return null;
  const row = await db.accessKey.findUnique({ where: { keyHash: sha256(key) }, include: { workspace: true } });
  if (!row || row.revokedAt) return null;
  const member = await db.membership.findUnique({ where: { userId_workspaceId: { userId: row.userId, workspaceId: row.workspaceId } } });
  if (!member) return null;
  // Throttle the write to once a minute.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await db.accessKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return row.workspace;
}
