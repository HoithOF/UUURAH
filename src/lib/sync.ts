import "server-only";
import { db } from "./db";
import { liveConnector } from "@/connectors/registry";
import type { MappedMoney } from "@/connectors/stripe-map";

export async function saveMoney(workspaceId: string, connectionId: string | null, source: string, rows: MappedMoney[]) {
  let n = 0;
  for (const r of rows) {
    await db.moneyTransaction.upsert({
      where: { workspaceId_source_externalId: { workspaceId, source, externalId: r.externalId } },
      create: { workspaceId, connectionId, source, ...r },
      update: { kind: r.kind, amountCents: r.amountCents, currency: r.currency, occurredAt: r.occurredAt, description: r.description, category: r.category },
    });
    n++;
  }
  return n;
}

// Pulls fresh data for one connection and records the run, success or failure.
export async function runSync(connectionId: string, trigger: "manual" | "webhook" | "schedule") {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const connector = liveConnector(connection.provider);
  if (!connector) throw new Error(`No live connector for ${connection.provider}`);
  const run = await db.syncRun.create({ data: { connectionId, trigger, status: "running" } });
  try {
    const result = await connector.sync(connection, connection.lastSyncedAt);
    const n = await saveMoney(connection.workspaceId, connection.id, connection.provider, result.money);
    const now = new Date();
    await db.$transaction([
      db.syncRun.update({ where: { id: run.id }, data: { status: "success", itemsSynced: n, finishedAt: now } }),
      db.connection.update({ where: { id: connectionId }, data: { lastSyncedAt: now, status: "connected", lastError: null } }),
    ]);
    return { ok: true as const, items: n };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.$transaction([
      db.syncRun.update({ where: { id: run.id }, data: { status: "error", error: message, finishedAt: new Date() } }),
      db.connection.update({ where: { id: connectionId }, data: { status: "error", lastError: message } }),
    ]);
    return { ok: false as const, error: message };
  }
}

// Connections that haven't synced in `staleMinutes`; used by the scheduled job.
export async function syncStale(staleMinutes = 30) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const due = await db.connection.findMany({
    where: { status: { not: "disconnected" }, provider: { not: "csv" }, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: cutoff } }] },
    select: { id: true },
  });
  const results = [];
  for (const c of due) results.push({ id: c.id, ...(await runSync(c.id, "schedule")) });
  return results;
}
