import type { MappedDeal, MappedEmployee, MappedPayrollRun } from "./types";

// Pure mapping for HubSpot deals and Merge HRIS (payroll) objects.

export interface HubSpotStage { id: string; label: string; metadata?: { isClosed?: string; probability?: string } }
export interface HubSpotDeal { id: string; properties: Record<string, string | null | undefined> }

const date = (s: string | null | undefined) => {
  if (!s) return null;
  const t = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

export function mapHubSpotDeal(d: HubSpotDeal, stages: Record<string, HubSpotStage>, currency: string, portalId: string | null): MappedDeal {
  const p = d.properties;
  const stage = stages[p.dealstage ?? ""];
  const isClosed = p.hs_is_closed === "true" || stage?.metadata?.isClosed === "true";
  const isWon = p.hs_is_closed_won === "true" || (isClosed && stage?.metadata?.probability === "1.0");
  const lastActivity = [p.notes_last_updated, p.notes_last_contacted, p.hs_last_sales_activity_timestamp].map(date).filter((x): x is Date => x !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    externalId: d.id,
    name: p.dealname || `Deal ${d.id}`,
    amountCents: Math.round(Number(p.amount || 0) * 100),
    currency: (p.deal_currency_code || currency).toUpperCase(),
    stage: stage?.label ?? p.dealstage ?? "Unknown",
    isClosed,
    isWon,
    closeDate: date(p.closedate),
    openedAt: date(p.createdate) ?? new Date(),
    lastActivityAt: lastActivity,
    webLink: portalId ? `https://app.hubspot.com/contacts/${portalId}/record/0-3/${d.id}` : null,
  };
}

export interface MergeEmployee { id: string; first_name?: string | null; last_name?: string | null; display_full_name?: string | null; job_title?: string | null; employment_status?: string | null; start_date?: string | null; termination_date?: string | null; remote_was_deleted?: boolean }
export interface MergePayrollRun { id: string; run_state?: string | null; run_type?: string | null; check_date?: string | null; remote_was_deleted?: boolean }
export interface MergeEmployeePayrollRun { payroll_run?: string | null; gross_pay?: number | null; net_pay?: number | null }

export function mapMergeEmployee(e: MergeEmployee): MappedEmployee | null {
  if (e.remote_was_deleted) return null;
  const status = (e.employment_status ?? "ACTIVE").toLowerCase();
  return {
    externalId: e.id,
    name: e.display_full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unnamed",
    title: e.job_title ?? null,
    status: status === "active" || status === "pending" ? status : "inactive",
    startedAt: date(e.start_date),
    endedAt: date(e.termination_date),
  };
}

// A payroll run's cost = the sum of every employee's gross pay on it. Only paid, regular-ish runs count.
export function mapMergePayrollRuns(runs: MergePayrollRun[], lines: MergeEmployeePayrollRun[], currency = "USD"): MappedPayrollRun[] {
  const byRun = new Map<string, { gross: number; net: number; people: number }>();
  for (const l of lines) {
    if (!l.payroll_run) continue;
    const r = byRun.get(l.payroll_run) ?? { gross: 0, net: 0, people: 0 };
    r.gross += l.gross_pay ?? 0;
    r.net += l.net_pay ?? 0;
    r.people += 1;
    byRun.set(l.payroll_run, r);
  }
  return runs
    .filter((r) => !r.remote_was_deleted && r.check_date && (r.run_state ?? "PAID").toUpperCase() === "PAID" && byRun.has(r.id))
    .map((r) => {
      const t = byRun.get(r.id)!;
      return { externalId: r.id, checkDate: date(r.check_date)!, grossCents: Math.round(t.gross * 100), netCents: Math.round(t.net * 100), people: t.people, currency };
    });
}
