import "server-only";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";

export type TokenKind = "reset" | "verify" | "invite" | "mfa";
const TTL: Record<TokenKind, number> = { reset: 60 * 60_000, verify: 7 * 864e5, invite: 7 * 864e5, mfa: 10 * 60_000 };

export async function issueToken(kind: TokenKind, data: { email: string; userId?: string; workspaceId?: string; role?: string; invitedById?: string }) {
  const token = randomToken(32);
  await db.authToken.create({ data: { kind, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL[kind]), ...data } });
  return token;
}

/** Looks a token up without using it. Returns null if unknown, used or expired. */
export async function peekToken(kind: TokenKind, token: string | undefined | null) {
  if (!token) return null;
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.kind !== kind || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

/** Marks a token used. Returns false if someone else used it first. */
export async function useToken(id: string) {
  const r = await db.authToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  return r.count === 1;
}
