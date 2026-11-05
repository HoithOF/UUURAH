import "server-only";
import { db } from "./db";
import { adSignals, adTotals, byCampaign, inRange, totals } from "./metrics-core";

export async function marketingSnapshot(workspaceId: string, now = new Date()) {
  const start = new Date(now.getTime() - 30 * 864e5);
  const prevStart = new Date(start.getTime() - 30 * 864e5);
  const [ads, sales] = await Promise.all([
    db.adMetric.findMany({ where: { workspaceId, date: { gte: prevStart, lt: now } } }),
    db.moneyTransaction.findMany({ where: { workspaceId, kind: "sale", occurredAt: { gte: prevStart, lt: now } }, select: { kind: true, amountCents: true, occurredAt: true } }),
  ]);
  const cur = ads.filter((a) => a.date >= start);
  const prev = ads.filter((a) => a.date < start);
  const salesCur = totals(inRange(sales, start, now)).sales;
  const salesPrev = totals(inRange(sales, prevStart, start)).sales;
  const t = adTotals(cur);
  const currency = ads[0]?.currency ?? "USD";
  return {
    hasData: ads.length > 0,
    currency,
    cur: t,
    prev: adTotals(prev),
    campaigns: byCampaign(cur),
    // Every dollar of sales per dollar of ads, from the money apps rather than the ad platforms' own claims.
    blendedReturn: t.spend > 0 && salesCur > 0 ? salesCur / t.spend : null,
    adShareOfSales: salesCur > 0 ? t.spend / salesCur : null,
    signals: adSignals(cur, prev, salesCur, salesPrev, currency),
  };
}
