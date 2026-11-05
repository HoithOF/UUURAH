import type { MappedMoney } from "./stripe-map";
import type { MappedBalance } from "./types";

// Pure mapping from Plaid's /transactions/sync and /accounts objects.
// Plaid amounts are positive when money LEAVES the account.

export interface PlaidTxn {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  balances: { current: number | null; available?: number | null; iso_currency_code: string | null };
}

// Money moving between the owner's own accounts, or loan principal, is neither income nor
// spending. Stripe/Square payouts land as transfers too, so counting them would double count sales.
const NEUTRAL = new Set(["TRANSFER_IN", "TRANSFER_OUT", "LOAN_PAYMENTS"]);

const title = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function mapPlaidTxn(t: PlaidTxn): MappedMoney[] {
  if (t.pending || !t.amount) return [];
  const cents = -Math.round(t.amount * 100); // flip to our sign: positive = money in
  const primary = t.personal_finance_category?.primary ?? "";
  let kind: MappedMoney["kind"];
  if (NEUTRAL.has(primary)) kind = "payout";
  else if (cents > 0) kind = primary === "INCOME" ? "sale" : "payout";
  else kind = primary === "BANK_FEES" ? "fee" : "expense";
  return [{
    externalId: t.transaction_id,
    kind,
    amountCents: cents,
    currency: (t.iso_currency_code ?? "USD").toUpperCase(),
    occurredAt: new Date(`${t.date}T12:00:00Z`),
    description: t.merchant_name || t.name,
    category: primary ? title(primary) : null,
  }];
}

export function mapPlaidAccount(a: PlaidAccount): MappedBalance | null {
  if (a.balances.current == null) return null;
  return {
    accountId: a.account_id,
    name: `${a.official_name || a.name}${a.mask ? ` ••${a.mask}` : ""}`,
    type: ["depository", "credit", "loan", "investment"].includes(a.type) ? a.type : "other",
    currentCents: Math.round(a.balances.current * 100),
    currency: (a.balances.iso_currency_code ?? "USD").toUpperCase(),
  };
}
