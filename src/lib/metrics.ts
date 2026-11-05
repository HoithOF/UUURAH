import "server-only";
import { db } from "./db";
import { dailyNet, inRange, moneySignals, totals } from "./metrics-core";

export async function moneySnapshot(workspaceId: string, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - 30 * 864e5);
  const prevStart = new Date(start.getTime() - 30 * 864e5);
  const txs = await db.moneyTransaction.findMany({
    where: { workspaceId, occurredAt: { gte: prevStart, lt: end } },
    select: { kind: true, amountCents: true, occurredAt: true, currency: true },
  });
  const cur = totals(inRange(txs, start, end));
  const prev = totals(inRange(txs, prevStart, start));
  const currency = txs[0]?.currency ?? "USD";
  return { cur, prev, currency, daily: dailyNet(inRange(txs, start, end), start, 30), signals: moneySignals(cur, prev) };
}
