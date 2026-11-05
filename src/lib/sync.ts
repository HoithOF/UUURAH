import "server-only";
import { db } from "./db";
import { liveConnector } from "@/connectors/registry";
import { tokenContext } from "./tokens";
import type { MappedMoney } from "@/connectors/stripe-map";
import type { MappedAdDay, MappedBalance, MappedInvoice } from "@/connectors/types";

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

export async function saveInvoices(workspaceId: string, connectionId: string, source: string, rows: MappedInvoice[]) {
  for (const r of rows) {
    await db.invoice.upsert({
      where: { workspaceId_source_externalId: { workspaceId, source, externalId: r.externalId } },
      create: { workspaceId, connectionId, source, ...r },
      update: { ...r },
    });
  }
  return rows.length;
}

export async function saveBalances(connectionId: string, rows: MappedBalance[]) {
  for (const r of rows) {
    await db.accountBalance.upsert({ where: { connectionId_accountId: { connectionId, accountId: r.accountId } }, create: { connectionId, ...r }, update: r });
  }
}

export async function saveAds(workspaceId: string, connectionId: string, source: string, rows: MappedAdDay[]) {
  for (const r of rows) {
    await db.adMetric.upsert({
      where: { workspaceId_source_campaignId_date: { workspaceId, source, campaignId: r.campaignId, date: r.date } },
      create: { workspaceId, connectionId, source, ...r },
      update: r,
    });
  }
  return rows.length;
}

// Pulls fresh data for one connection and records the run, success or failure.
export async function runSync(connectionId: string, trigger: "manual" | "webhook" | "schedule") {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const connector = liveConnector(connection.provider);
  if (!connector) throw new Error(`No live connector for ${connection.provider}`);
  const run = await db.syncRun.create({ data: { connectionId, trigger, status: "running" } });
  try {
    const ctx = await tokenContext(connection, connector);
    const result = await connector.sync(connection, connection.lastSyncedAt, ctx);
    const n =
      (await saveMoney(connection.workspaceId, connection.id, connection.provider, result.money)) +
      (await saveInvoices(connection.workspaceId, connection.id, connection.provider, result.invoices ?? [])) +
      (await saveAds(connection.workspaceId, connection.id, connection.provider, result.ads ?? []));
    await saveBalances(connection.id, result.balances ?? []);
    if (result.removedMoneyIds?.length)
      await db.moneyTransaction.deleteMany({ where: { workspaceId: connection.workspaceId, source: connection.provider, externalId: { in: result.removedMoneyIds } } });
    const now = new Date();
    await db.$transaction([
      db.syncRun.update({ where: { id: run.id }, data: { status: "success", itemsSynced: n, finishedAt: now } }),
      db.connection.update({
        where: { id: connectionId },
        data: { lastSyncedAt: now, status: "connected", lastError: null, ...(result.cursor !== undefined ? { syncCursor: result.cursor } : {}) },
      }),
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
