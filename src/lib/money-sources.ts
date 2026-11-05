// Which app's numbers count for which kind of money, so the same sale isn't counted twice
// when, say, Stripe and QuickBooks (which also records Stripe sales) are both connected. Pure.

export const PAYMENTS = ["stripe", "square"];
export const ACCOUNTING = ["quickbooks", "xero"];
export const BANK = ["plaid"];
const NAMES: Record<string, string> = { stripe: "Stripe", square: "Square", quickbooks: "QuickBooks", xero: "Xero", plaid: "your bank", csv: "spreadsheet uploads" };

export type CountingRules = { sales: string[]; fees: string[]; expenses: string[]; note: string | null };

export function countingRules(providers: string[]): CountingRules {
  const has = (group: string[]) => group.filter((p) => providers.includes(p));
  const pay = has(PAYMENTS), acct = has(ACCOUNTING), bank = has(BANK);
  const csv = providers.includes("csv") ? ["csv"] : [];
  const sales = [...(pay.length ? pay : acct.length ? acct : bank), ...csv];
  const fees = [...(pay.length ? pay : acct.length ? acct : bank), ...csv];
  const expenses = [...(acct.length ? acct : bank.length ? bank : pay), ...csv];
  const overlapping = [pay.length, acct.length, bank.length].filter(Boolean).length > 1;
  const list = (ids: string[]) => ids.map((i) => NAMES[i] ?? i).join(" and ");
  const note = overlapping
    ? `To avoid counting the same money twice, sales come from ${list(sales.filter((s) => s !== "csv"))} and spending from ${list(expenses.filter((s) => s !== "csv"))}.` +
      (pay.length && acct.length ? ` Sales recorded only in ${list(acct)} (like cash or check payments) aren't included.` : "")
    : null;
  return { sales, fees, expenses, note };
}

/** Prisma `where` fragment that keeps only the transactions these rules count. Payouts are neutral and always kept. */
export function countedWhere(r: CountingRules) {
  return {
    OR: [
      { kind: { in: ["sale", "refund"] }, source: { in: r.sales } },
      { kind: "fee", source: { in: r.fees } },
      { kind: "expense", source: { in: r.expenses } },
      { kind: "payout" },
    ],
  };
}

/** The currency most of the money is in; totals use only that currency rather than adding dollars to euros. */
export function mainCurrency(counts: { currency: string; n: number }[], fallback = "USD") {
  return counts.slice().sort((a, b) => b.n - a.n)[0]?.currency ?? fallback;
}
