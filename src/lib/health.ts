import "server-only";
import { db } from "./db";
import { moneySnapshot } from "./metrics";
import { marketingSnapshot } from "./marketing";
import { commSnapshot } from "./communication";
import { peopleSnapshot, salesSnapshot } from "./sales-people";
import { areaHealth, type Signal } from "./metrics-core";

/** Everything the overview needs: every section's snapshot, all warnings worst-first, and a health status per area. */
export async function businessHealth(workspaceId: string) {
  const [connections, money, marketing, comm, sales, people] = await Promise.all([
    db.connection.findMany({ where: { workspaceId, status: { not: "disconnected" } } }),
    moneySnapshot(workspaceId),
    marketingSnapshot(workspaceId),
    commSnapshot(workspaceId),
    salesSnapshot(workspaceId),
    peopleSnapshot(workspaceId),
  ]);

  const signals: Signal[] = [];
  for (const c of connections.filter((c) => c.status === "error"))
    signals.push({ severity: "critical", section: "connections", title: `${c.displayName} stopped syncing`, detail: c.lastError ?? "Reconnect it on the Connections page." });
  signals.push(...money.signals, ...(marketing.hasData ? marketing.signals : []), ...comm.signals, ...sales.signals, ...people.signals);
  const rank = { critical: 0, warning: 1, good: 2 } as const;
  signals.sort((a, b) => rank[a.severity] - rank[b.severity]);
  // Keep "all good" lines only if nothing is wrong anywhere.
  const problems = signals.some((s) => s.severity !== "good") ? signals.filter((s) => s.severity !== "good") : signals;
  const has = (ids: string[]) => connections.some((c) => ids.includes(c.provider));
  const areas = areaHealth(signals, {
    money: has(["stripe", "square", "quickbooks", "xero", "plaid", "csv"]),
    marketing: has(["google-ads", "meta-ads"]),
    communication: has(["outlook", "google-calendar"]),
    sales: has(["hubspot"]),
    people: has(["merge-hris"]),
  });
  return { connections, money, marketing, comm, sales, people, signals, problems, areas };
}
