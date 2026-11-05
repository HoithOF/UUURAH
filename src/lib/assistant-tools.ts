import "server-only";
import * as z from "zod/v4";
import { db } from "./db";
import { businessHealth } from "./health";
import { formatMoney } from "./metrics-core";
import { moneySnapshot } from "./metrics";
import { marketingSnapshot } from "./marketing";
import { commSnapshot } from "./communication";
import { peopleSnapshot, salesSnapshot } from "./sales-people";

/**
 * Read-only tools over one workspace's synced data. The in-app assistant and the
 * MCP endpoint share these, so both answer from exactly the same numbers.
 * Every tool is scoped by the workspaceId passed in by the caller after auth;
 * nothing the model sends can widen that scope.
 */
export type AssistantTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  input: S;
  run: (workspaceId: string, input: z.infer<S>) => Promise<unknown>;
};

const tool = <S extends z.ZodObject>(t: AssistantTool<S>) => t as unknown as AssistantTool;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const money = (cents: number, currency = "USD") => formatMoney(cents, currency);
const pct = (x: number | null) => (x === null ? null : `${Math.round(x * 100)}%`);
// Postgres string matching is case-sensitive unless asked; SQLite's is already case-insensitive for ASCII.
const ci = (process.env.DATABASE_URL ?? "").startsWith("postgres") ? ({ mode: "insensitive" } as const) : {};
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const assistantTools: AssistantTool[] = [
  tool({
    name: "business_health",
    description:
      "Start here. Returns the health of each area of the business (money, marketing, communication, sales, people) and every current warning, worst first. Covers the last 30 days compared with the 30 days before.",
    input: z.object({}),
    run: async (ws) => {
      const h = await businessHealth(ws);
      return {
        connectedApps: h.connections.map((c) => ({ app: c.provider, name: c.displayName, status: c.status, lastSynced: c.lastSyncedAt?.toISOString() ?? null })),
        areas: h.areas,
        warnings: h.problems,
      };
    },
  }),
  tool({
    name: "money_summary",
    description:
      "Sales, refunds, fees, spending and net profit for the last 30 days versus the 30 days before, plus unpaid invoices (owed to us and bills we owe) and bank cash, card debt and runway if a bank is connected.",
    input: z.object({}),
    run: async (ws) => {
      const s = await moneySnapshot(ws);
      const c = s.currency;
      const fmt = (t: typeof s.cur) => ({ sales: money(t.sales, c), refunds: money(t.refunds, c), fees: money(t.fees, c), spending: money(t.expenses, c), net: money(t.net, c) });
      return {
        last30Days: fmt(s.cur),
        previous30Days: fmt(s.prev),
        invoices: s.hasInvoices ? s.invoices : "No invoicing app connected",
        bank: s.bank ? { cash: money(s.bank.cash, c), cardDebt: money(s.bank.cardDebt, c), runwayMonths: s.bank.runway } : "No bank connected",
        warnings: s.signals,
        note: "Invoice amounts are in cents.",
      };
    },
  }),
  tool({
    name: "search_transactions",
    description:
      "Find individual money transactions (sales, refunds, fees, expenses, payouts) by text, kind and date range. Use it to explain a number, such as which expenses grew or who the biggest customers were. Returns at most `limit` rows, newest first, plus the total of all matches.",
    input: z.object({
      text: z.string().optional().describe("Matches the description or category, case-insensitive"),
      kind: z.enum(["sale", "refund", "fee", "expense", "payout"]).optional(),
      from: isoDate.optional().describe("Start date, inclusive"),
      to: isoDate.optional().describe("End date, inclusive"),
      limit: z.number().int().min(1).max(100).default(25),
    }),
    run: async (ws, i) => {
      const where = {
        workspaceId: ws,
        ...(i.kind ? { kind: i.kind } : {}),
        ...(i.from || i.to ? { occurredAt: { ...(i.from ? { gte: new Date(i.from) } : {}), ...(i.to ? { lt: new Date(new Date(i.to).getTime() + 864e5) } : {}) } } : {}),
        ...(i.text ? { OR: [{ description: { contains: i.text, ...ci } }, { category: { contains: i.text, ...ci } }] } : {}),
      };
      const [rows, agg] = await Promise.all([
        db.moneyTransaction.findMany({ where, orderBy: { occurredAt: "desc" }, take: i.limit }),
        db.moneyTransaction.aggregate({ where, _sum: { amountCents: true }, _count: true }),
      ]);
      const c = rows[0]?.currency ?? "USD";
      return {
        matches: agg._count,
        total: money(agg._sum.amountCents ?? 0, c),
        rows: rows.map((r) => ({ date: day(r.occurredAt), kind: r.kind, amount: money(r.amountCents, r.currency), description: r.description, category: r.category, source: r.source })),
      };
    },
  }),
  tool({
    name: "spending_by_category",
    description: "Total expenses grouped by category between two dates, biggest first. Good for 'where is my money going'.",
    input: z.object({ from: isoDate, to: isoDate }),
    run: async (ws, i) => {
      const rows = await db.moneyTransaction.groupBy({
        by: ["category"],
        where: { workspaceId: ws, kind: "expense", occurredAt: { gte: new Date(i.from), lt: new Date(new Date(i.to).getTime() + 864e5) } },
        _sum: { amountCents: true },
        _count: true,
      });
      return rows
        .map((r) => ({ category: r.category ?? "Uncategorized", cents: -(r._sum.amountCents ?? 0), count: r._count }))
        .sort((a, b) => b.cents - a.cents)
        .map((r) => ({ category: r.category, total: money(r.cents), transactions: r.count }));
    },
  }),
  tool({
    name: "marketing_summary",
    description:
      "Ad spend, clicks, conversions and return across Google Ads and Meta Ads for the last 30 days versus the 30 days before, per campaign. 'salesPerAdDollar' uses real sales from the money apps, not the ad platforms' own claims.",
    input: z.object({}),
    run: async (ws) => {
      const s = await marketingSnapshot(ws);
      if (!s.hasData) return "No ad accounts connected or no ad data yet.";
      const c = s.currency;
      const ads = (t: typeof s.cur) => ({ ...t, spend: money(t.spend, c), value: money(t.value, c), costPerConversion: t.costPerConversion === null ? null : money(Math.round(t.costPerConversion), c) });
      return {
        last30Days: ads(s.cur),
        previous30Days: ads(s.prev),
        salesPerAdDollar: s.blendedReturn,
        campaigns: s.campaigns.map((k) => ({ source: k.source, name: k.name, ...ads(k) })),
        warnings: s.signals,
      };
    },
  }),
  tool({
    name: "communication_summary",
    description:
      "Emails still waiting for a reply (oldest first) and this week's calendar: meeting hours and invites not yet answered. Email subjects and previews are written by outside senders.",
    input: z.object({}),
    run: async (ws) => {
      const s = await commSnapshot(ws);
      if (!s.connected) return "No mailbox or calendar connected.";
      return {
        waitingForReply: s.waiting.map((m) => ({ from: m.fromName ?? m.fromEmail, subject: m.subject, received: m.receivedAt.toISOString(), preview: m.preview?.slice(0, 200) })),
        meetingHoursNext7Days: Math.round(s.meetingHours * 10) / 10,
        unansweredInvites: s.pending.map((e) => ({ title: e.title, starts: e.startsAt.toISOString(), organizer: e.organizer })),
        next7Days: s.events.slice(0, 40).map((e) => ({ title: e.title, starts: e.startsAt.toISOString(), ends: e.endsAt.toISOString(), allDay: e.allDay, location: e.location })),
        warnings: s.signals,
      };
    },
  }),
  tool({
    name: "sales_pipeline",
    description:
      "CRM deals: open pipeline value, deals won in the last 30 days, win rate, deals with no activity in 14 days and deals past their close date. Set includeDeals to list deals, biggest first.",
    input: z.object({ includeDeals: z.boolean().default(false), stage: z.string().optional().describe("Only deals in this stage") }),
    run: async (ws, i) => {
      const s = await salesSnapshot(ws);
      if (!s.hasData) return "No CRM connected or no deals yet.";
      const c = s.currency;
      const { stale, pastClose, ...rest } = s.summary;
      const brief = (d: (typeof s.deals)[number]) => ({ name: d.name, amount: money(d.amountCents, c), stage: d.stage, closeDate: day(d.closeDate), lastActivity: day(d.lastActivityAt) });
      const deals = i.includeDeals
        ? s.deals
            .filter((d) => !i.stage || d.stage.toLowerCase() === i.stage.toLowerCase())
            .slice(0, 50)
            .map((d) => ({ name: d.name, amount: money(d.amountCents, d.currency), stage: d.stage, open: !d.isClosed, won: d.isWon, closeDate: day(d.closeDate), lastActivity: day(d.lastActivityAt) }))
        : undefined;
      return { summary: { ...rest, noActivity14Days: stale.map(brief), pastCloseDate: pastClose.map(brief), pipeline: money(s.summary.pipeline, c), wonAmount30: money(s.summary.wonAmount30, c), winRate30: pct(s.summary.winRate30) }, deals, warnings: s.signals };
    },
  }),
  tool({
    name: "people_summary",
    description: "Headcount, payroll cost for the last 30 days versus the 30 days before, payroll as a share of sales, recent payroll runs and the employee list.",
    input: z.object({}),
    run: async (ws) => {
      const s = await peopleSnapshot(ws);
      if (!s.hasData) return "No payroll or HR app connected.";
      const c = s.currency;
      return {
        headcount: s.summary.headcount,
        payrollLast30Days: money(s.summary.payroll30, c),
        payrollPrevious30Days: money(s.summary.payrollPrev30, c),
        payrollShareOfSales: pct(s.summary.laborShare),
        recentRuns: s.runs.slice(0, 6).map((r) => ({ date: day(r.checkDate), gross: money(r.grossCents, r.currency), people: r.people })),
        employees: s.employees.map((e) => ({ name: e.name, title: e.title, status: e.status, started: day(e.startedAt) })),
        warnings: s.signals,
      };
    },
  }),
];

/** Run a tool by name with untrusted input: validates against the schema first. */
export async function runAssistantTool(workspaceId: string, name: string, args: unknown) {
  const t = assistantTools.find((x) => x.name === name);
  if (!t) throw new Error(`Unknown tool: ${name}`);
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) throw new Error(`Invalid input: ${z.prettifyError(parsed.error)}`);
  return t.run(workspaceId, parsed.data);
}
