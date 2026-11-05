import "server-only";
import { db } from "./db";
import { countedWhere, countingRules, mainCurrency } from "./money-sources";

/** The `where` to use for every money total in a workspace: no double counting, one currency. */
export async function moneyScope(workspaceId: string) {
  const conns = await db.connection.findMany({ where: { workspaceId, status: { not: "disconnected" } }, select: { provider: true } });
  const rules = countingRules([...new Set(conns.map((c) => c.provider))]);
  const counted = countedWhere(rules);
  const byCurrency = await db.moneyTransaction.groupBy({ by: ["currency"], where: { workspaceId, ...counted }, _count: true });
  const currency = mainCurrency(byCurrency.map((c) => ({ currency: c.currency, n: c._count })));
  const otherCurrency = byCurrency.filter((c) => c.currency !== currency).reduce((s, c) => s + c._count, 0);
  return {
    where: { workspaceId, currency, ...counted },
    currency,
    note: [rules.note, otherCurrency ? `${otherCurrency} transaction${otherCurrency === 1 ? " is" : "s are"} in another currency and left out of totals.` : null].filter(Boolean).join(" ") || null,
  };
}
