import Papa from "papaparse";

// Turns an uploaded spreadsheet into rows of the shared money format.
// Pure: no database, so it is easy to test.

export interface ParsedMoneyRow {
  externalId: string;
  kind: "sale" | "refund" | "fee" | "expense" | "payout";
  amountCents: number;
  occurredAt: Date;
  description: string | null;
  category: string | null;
}

export interface CsvParseResult {
  rows: ParsedMoneyRow[];
  skipped: { line: number; reason: string }[];
  columns: { date: string; amount: string; description?: string; category?: string; type?: string };
}

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date", "day", "created"];
const AMOUNT_HEADERS = ["amount", "total", "value", "sum", "net", "price"];
const DEBIT_HEADERS = ["debit", "withdrawal", "money out", "spent"];
const CREDIT_HEADERS = ["credit", "deposit", "money in", "received"];
const DESC_HEADERS = ["description", "memo", "details", "name", "payee", "item", "note", "notes"];
const CATEGORY_HEADERS = ["category", "account", "type of expense", "class"];
const TYPE_HEADERS = ["type", "kind", "transaction type"];

function pick(headers: string[], candidates: string[]) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return headers[i];
  }
  for (const c of candidates) {
    const i = lower.findIndex((h) => h.includes(c));
    if (i >= 0) return headers[i];
  }
  return undefined;
}

export function parseAmountToCents(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }
  s = s.replace(/[$€£¥\s,]/g, "").replace(/^(USD|EUR|GBP|CAD|AUD)/i, "");
  if (s.startsWith("-")) { negative = !negative; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return negative ? -cents : cents;
}

export function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); // US style M/D/Y
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return utc(y, +m[1], +m[2]);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

function utc(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12));
}

function kindFor(cents: number, typeValue: string | undefined): ParsedMoneyRow["kind"] {
  const t = (typeValue ?? "").toLowerCase();
  if (t.includes("refund")) return "refund";
  if (t.includes("fee")) return "fee";
  if (t.includes("payout") || t.includes("transfer")) return "payout";
  if (t.includes("expense") || t.includes("bill") || t.includes("purchase") || t.includes("payroll")) return "expense";
  if (t.includes("sale") || t.includes("income") || t.includes("revenue") || t.includes("invoice")) return "sale";
  return cents < 0 ? "expense" : "sale";
}

export function parseMoneyCsv(text: string, sourceKey: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true });
  const headers = parsed.meta.fields ?? [];
  const date = pick(headers, DATE_HEADERS);
  const amount = pick(headers, AMOUNT_HEADERS);
  const debit = pick(headers, DEBIT_HEADERS);
  const credit = pick(headers, CREDIT_HEADERS);
  if (!date) throw new Error(`Couldn't find a date column. Columns found: ${headers.join(", ") || "none"}.`);
  if (!amount && !debit && !credit) throw new Error(`Couldn't find an amount column. Columns found: ${headers.join(", ") || "none"}.`);
  const description = pick(headers, DESC_HEADERS);
  const category = pick(headers, CATEGORY_HEADERS);
  const type = pick(headers, TYPE_HEADERS);
  const typeCol = type && type !== category ? type : undefined;

  const rows: ParsedMoneyRow[] = [];
  const skipped: CsvParseResult["skipped"] = [];
  const seen = new Map<string, number>();

  parsed.data.forEach((r, i) => {
    const line = i + 2;
    const when = parseDate(r[date]);
    let cents: number | null = null;
    if (amount) cents = parseAmountToCents(r[amount]);
    if (cents == null && (debit || credit)) {
      const out = debit ? parseAmountToCents(r[debit]) : null;
      const inn = credit ? parseAmountToCents(r[credit]) : null;
      if (out) cents = -Math.abs(out);
      else if (inn) cents = Math.abs(inn);
    }
    if (!when) return skipped.push({ line, reason: "unreadable date" });
    if (cents == null) return skipped.push({ line, reason: "unreadable amount" });
    if (cents === 0) return skipped.push({ line, reason: "zero amount" });

    const desc = description ? r[description]?.trim() || null : null;
    const cat = category ? r[category]?.trim() || null : null;
    const kind = kindFor(cents, typeCol ? r[typeCol] : undefined);
    const signed = kind === "sale" ? Math.abs(cents) : kind === "payout" ? cents : -Math.abs(cents);
    // Same content uploaded twice should not double count; identical rows in one file are kept apart.
    const base = `${sourceKey}|${when.toISOString().slice(0, 10)}|${signed}|${desc ?? ""}|${cat ?? ""}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({ externalId: `${base}|${n}`, kind, amountCents: signed, occurredAt: when, description: desc, category: cat });
  });

  return { rows, skipped, columns: { date, amount: amount ?? `${debit ?? ""}/${credit ?? ""}`, description, category, type: typeCol } };
}
