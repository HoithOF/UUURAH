import "server-only";
import type { LiveConnector, MappedEmployee } from "./types";
import { mapMergeEmployee, mapMergePayrollRuns, type MergeEmployee, type MergeEmployeePayrollRun, type MergePayrollRun } from "./crm-hr-map";

// Payroll and HR through Merge's unified HRIS API: one integration covers Gusto, ADP,
// Rippling, Paychex, BambooHR and more. The owner picks their provider in Merge Link.

const API = "https://api.merge.dev/api";

export async function merge<T>(path: string, accountToken?: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${process.env.MERGE_API_KEY}`, "Content-Type": "application/json" };
  if (accountToken) headers["X-Account-Token"] = accountToken;
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail ?? body?.errors?.[0]?.detail ?? `Merge request failed (${res.status})`);
  return body as T;
}

async function all<T>(path: string, token: string, max = 5000): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = `${path}${path.includes("?") ? "&" : "?"}page_size=100`;
  while (next && out.length < max) {
    const page: { results: T[]; next: string | null } = await merge(next.startsWith("http") ? next : next, token);
    out.push(...page.results);
    next = page.next ? (page.next.startsWith("http") ? page.next : `${path}${path.includes("?") ? "&" : "?"}page_size=100&cursor=${page.next}`) : null;
  }
  return out;
}

export const mergeHrisConnector: LiveConnector = {
  id: "merge-hris",
  connectVia: "merge-link",

  isConfigured() {
    return Boolean(process.env.MERGE_API_KEY);
  },

  async sync(_c, since, { accessToken }) {
    if (!accessToken) throw new Error("Payroll sign-in is missing; reconnect payroll.");
    const from = new Date(since ? since.getTime() - 30 * 864e5 : Date.now() - 365 * 864e5).toISOString();
    const employees = (await all<MergeEmployee>("/hris/v1/employees", accessToken)).map(mapMergeEmployee).filter((e): e is MappedEmployee => e !== null);
    const runs = await all<MergePayrollRun>(`/hris/v1/payroll-runs?started_after=${encodeURIComponent(from)}`, accessToken);
    const lines = await all<MergeEmployeePayrollRun>(`/hris/v1/employee-payroll-runs?started_after=${encodeURIComponent(from)}`, accessToken, 50000);
    return { money: [], employees, payrollRuns: mapMergePayrollRuns(runs, lines) };
  },

  async disconnect(_c, { accessToken }) {
    if (accessToken) await merge("/hris/v1/delete-account", accessToken, { method: "POST" });
  },
};
