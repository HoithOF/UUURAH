import "server-only";
import { db } from "./db";
import { inRange, peopleSignals, peopleSummary, salesSignals, salesSummary, totals } from "./metrics-core";

export async function salesSnapshot(workspaceId: string, now = new Date()) {
  const deals = await db.deal.findMany({ where: { workspaceId }, orderBy: { amountCents: "desc" } });
  const s = salesSummary(deals, now);
  const currency = deals[0]?.currency ?? "USD";
  return { hasData: deals.length > 0, currency, deals, summary: s, signals: salesSignals(s, currency) };
}

export async function peopleSnapshot(workspaceId: string, now = new Date()) {
  const d60 = new Date(now.getTime() - 60 * 864e5);
  const d30 = new Date(now.getTime() - 30 * 864e5);
  const [runs, employees, sales] = await Promise.all([
    db.payrollRun.findMany({ where: { workspaceId }, orderBy: { checkDate: "desc" }, take: 52 }),
    db.employee.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    db.moneyTransaction.findMany({ where: { workspaceId, kind: "sale", occurredAt: { gte: d60, lt: now } }, select: { kind: true, amountCents: true, occurredAt: true } }),
  ]);
  const active = employees.filter((e) => e.status === "active");
  const p = peopleSummary(runs, active.length, totals(inRange(sales, d30, now)).sales, totals(inRange(sales, d60, d30)).sales, now);
  return { hasData: runs.length > 0 || employees.length > 0, currency: runs[0]?.currency ?? "USD", runs, employees, summary: p, signals: peopleSignals(p) };
}
