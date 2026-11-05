import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/** Records a hit and says whether the key is still under `limit` hits in the last `windowMs`. */
export async function allow(key: string, limit: number, windowMs: number) {
  const since = new Date(Date.now() - windowMs);
  const count = await db.rateHit.count({ where: { key, createdAt: { gte: since } } });
  if (count >= limit) return false;
  await db.rateHit.create({ data: { key } });
  // Opportunistic cleanup of old rows.
  if (Math.random() < 0.02) await db.rateHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 864e5) } } });
  return true;
}

export async function clearHits(key: string) {
  await db.rateHit.deleteMany({ where: { key } });
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip") ?? "unknown";
}
