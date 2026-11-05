// Pure money math for the dashboard. Amounts are in cents.

export interface Tx { kind: string; amountCents: number; occurredAt: Date }

export interface PeriodTotals { sales: number; refunds: number; fees: number; expenses: number; net: number; count: number }

export function totals(txs: Tx[]): PeriodTotals {
  const t: PeriodTotals = { sales: 0, refunds: 0, fees: 0, expenses: 0, net: 0, count: txs.length };
  for (const x of txs) {
    if (x.kind === "sale") t.sales += x.amountCents;
    else if (x.kind === "refund") t.refunds += x.amountCents;
    else if (x.kind === "fee") t.fees += x.amountCents;
    else if (x.kind === "expense") t.expenses += x.amountCents;
  }
  // Payouts move money between accounts; they are not profit or loss.
  t.net = t.sales + t.refunds + t.fees + t.expenses;
  return t;
}

export function inRange(txs: Tx[], from: Date, to: Date) {
  return txs.filter((x) => x.occurredAt >= from && x.occurredAt < to);
}

export function dailyNet(txs: Tx[], from: Date, days: number) {
  const out = Array.from({ length: days }, (_, i) => ({ day: new Date(from.getTime() + i * 864e5).toISOString().slice(0, 10), sales: 0, out: 0 }));
  for (const x of txs) {
    const i = Math.floor((x.occurredAt.getTime() - from.getTime()) / 864e5);
    if (i < 0 || i >= days) continue;
    if (x.kind === "sale") out[i].sales += x.amountCents;
    else if (x.kind !== "payout") out[i].out += -x.amountCents;
  }
  return out;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export type Severity = "critical" | "warning" | "good";
export interface Signal { severity: Severity; title: string; detail: string; section: string }

// The first rules of the "where is my business struggling" view.
// Each new wave of connectors adds rules here.
export function moneySignals(cur: PeriodTotals, prev: PeriodTotals): Signal[] {
  const s: Signal[] = [];
  const change = pctChange(cur.sales, prev.sales);
  if (cur.count === 0 && prev.count === 0) return s;
  if (change !== null && change <= -10)
    s.push({ severity: change <= -25 ? "critical" : "warning", section: "money", title: `Sales are down ${Math.abs(Math.round(change))}%`, detail: "Compared with the 30 days before." });
  if (cur.sales > 0 && -cur.refunds / cur.sales >= 0.05)
    s.push({ severity: "warning", section: "money", title: `Refunds are ${Math.round((-cur.refunds / cur.sales) * 100)}% of sales`, detail: "Above 5% usually points to a product or service problem." });
  if (cur.net < 0)
    s.push({ severity: "critical", section: "money", title: "You spent more than you made this month", detail: "Expenses, refunds and fees are higher than sales over the last 30 days." });
  const expChange = pctChange(-cur.expenses, -prev.expenses);
  if (expChange !== null && expChange >= 20 && (change === null || expChange - change >= 15))
    s.push({ severity: "warning", section: "money", title: `Spending is up ${Math.round(expChange)}%`, detail: "It is growing faster than sales." });
  if (s.length === 0) s.push({ severity: "good", section: "money", title: "Money looks healthy", detail: "No warning signs in the last 30 days." });
  return s;
}

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: Math.abs(cents) >= 100000 ? 0 : 2 }).format(cents / 100);
}

export interface InvoiceLite { direction: string; balanceCents: number; dueAt: Date | null; contact: string | null }

export function invoiceSummary(invoices: InvoiceLite[], now = new Date()) {
  const open = invoices.filter((i) => i.balanceCents > 0);
  const sum = (xs: InvoiceLite[]) => xs.reduce((s, i) => s + i.balanceCents, 0);
  const overdue = (i: InvoiceLite) => i.dueAt !== null && i.dueAt < now;
  const recv = open.filter((i) => i.direction === "receivable");
  const pay = open.filter((i) => i.direction === "payable");
  return {
    owedToYou: sum(recv),
    owedToYouOverdue: sum(recv.filter(overdue)),
    overdueCustomers: recv.filter(overdue).length,
    youOwe: sum(pay),
    youOweOverdue: sum(pay.filter(overdue)),
    billsDueSoon: sum(pay.filter((i) => i.dueAt && i.dueAt >= now && i.dueAt.getTime() - now.getTime() < 7 * 864e5)),
  };
}

export function invoiceSignals(s: ReturnType<typeof invoiceSummary>, monthlySales: number, currency = "USD"): Signal[] {
  const out: Signal[] = [];
  if (s.owedToYouOverdue > 0) {
    const big = monthlySales > 0 && s.owedToYouOverdue >= monthlySales * 0.25;
    out.push({ severity: big ? "critical" : "warning", section: "money", title: `${formatMoney(s.owedToYouOverdue, currency)} in overdue invoices`, detail: `${s.overdueCustomers} customer invoice${s.overdueCustomers === 1 ? " is" : "s are"} past due. Chasing these is the fastest cash you can get.` });
  }
  if (s.youOweOverdue > 0)
    out.push({ severity: "warning", section: "money", title: `${formatMoney(s.youOweOverdue, currency)} in overdue bills`, detail: "Late bills can mean late fees or unhappy suppliers." });
  return out;
}

// Months of cash left at the last 30 days' burn. null = not burning cash.
export function runwayMonths(cashCents: number, net30Cents: number): number | null {
  if (net30Cents >= 0) return null;
  return cashCents / -net30Cents;
}

export function cashSignals(cashCents: number, cardDebtCents: number, net30Cents: number, currency = "USD"): Signal[] {
  const out: Signal[] = [];
  const months = runwayMonths(cashCents, net30Cents);
  if (months !== null && months < 6)
    out.push({
      severity: months < 3 ? "critical" : "warning",
      section: "money",
      title: months < 1 ? "Less than a month of cash left" : `About ${Math.floor(months)} month${Math.floor(months) === 1 ? "" : "s"} of cash left`,
      detail: `At the last 30 days' pace you burn ${formatMoney(-net30Cents, currency)} a month against ${formatMoney(cashCents, currency)} in the bank.`,
    });
  if (cardDebtCents > 0 && cashCents > 0 && cardDebtCents > cashCents * 0.5)
    out.push({ severity: "warning", section: "money", title: `${formatMoney(cardDebtCents, currency)} on credit cards`, detail: "That is more than half of your cash in the bank." });
  return out;
}

export interface AdRow { source: string; campaignId: string; campaignName: string; date: Date; spendCents: number; impressions: number; clicks: number; conversions: number; conversionValueCents: number }

export function adTotals(rows: AdRow[]) {
  const t = { spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 };
  for (const r of rows) {
    t.spend += r.spendCents; t.impressions += r.impressions; t.clicks += r.clicks; t.conversions += r.conversions; t.value += r.conversionValueCents;
  }
  return {
    ...t,
    costPerConversion: t.conversions > 0 ? t.spend / t.conversions : null,
    roas: t.spend > 0 && t.value > 0 ? t.value / t.spend : null,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : null,
  };
}

export function byCampaign(rows: AdRow[]) {
  const map = new Map<string, AdRow[]>();
  for (const r of rows) {
    const k = `${r.source}|${r.campaignId}`;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.values()]
    .map((rs) => ({ source: rs[0].source, campaignId: rs[0].campaignId, name: rs[rs.length - 1].campaignName, ...adTotals(rs) }))
    .sort((a, b) => b.spend - a.spend);
}

// Marketing rules. `sales` are from the money section, so this is where ads meet revenue.
export function adSignals(cur: AdRow[], prev: AdRow[], salesCur: number, salesPrev: number, currency = "USD"): Signal[] {
  const out: Signal[] = [];
  const c = adTotals(cur);
  const p = adTotals(prev);
  if (c.spend === 0) return out;
  const wasted = byCampaign(cur).filter((x) => x.spend >= 10000 && x.conversions === 0);
  if (wasted.length)
    out.push({
      severity: "warning",
      section: "marketing",
      title: `${formatMoney(wasted.reduce((s, x) => s + x.spend, 0), currency)} spent on ads with no results`,
      detail: `${wasted.slice(0, 3).map((x) => x.name).join(", ")}${wasted.length > 3 ? ` and ${wasted.length - 3} more` : ""} got zero conversions in 30 days.`,
    });
  if (c.roas !== null && c.roas < 1)
    out.push({ severity: "critical", section: "marketing", title: `Ads return ${formatMoney(Math.round(c.roas * 100), currency)} per $1 spent`, detail: "The platforms report less in sales than you paid for the ads." });
  const spendUp = pctChange(c.spend, p.spend);
  const salesUp = pctChange(salesCur, salesPrev);
  if (spendUp !== null && spendUp >= 20 && salesUp !== null && salesUp < spendUp / 2)
    out.push({ severity: "warning", section: "marketing", title: `Ad spend up ${Math.round(spendUp)}%, sales ${salesUp >= 0 ? `up only ${Math.round(salesUp)}%` : `down ${Math.abs(Math.round(salesUp))}%`}`, detail: "The extra ad money isn't showing up as sales." });
  const cpcUp = c.costPerConversion !== null && p.costPerConversion !== null ? pctChange(c.costPerConversion, p.costPerConversion) : null;
  if (cpcUp !== null && cpcUp >= 30)
    out.push({ severity: "warning", section: "marketing", title: `Each conversion costs ${Math.round(cpcUp)}% more`, detail: `${formatMoney(Math.round(c.costPerConversion!), currency)} now vs. ${formatMoney(Math.round(p.costPerConversion!), currency)} before.` });
  if (out.length === 0) out.push({ severity: "good", section: "marketing", title: "Ads look healthy", detail: "No wasted campaigns and spend is keeping pace with sales." });
  return out;
}
