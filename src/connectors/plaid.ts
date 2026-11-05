import "server-only";
import type { LiveConnector, MappedBalance } from "./types";
import type { MappedMoney } from "./stripe-map";
import { mapPlaidAccount, mapPlaidTxn, type PlaidAccount, type PlaidTxn } from "./plaid-map";

// Plaid connects bank and card accounts through its Link widget (in the page, not a redirect).
// Sync uses /transactions/sync with a saved cursor, so each run only fetches what changed.

const host = () => (process.env.PLAID_ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com");

export async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${host()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_message ?? `Plaid request failed (${res.status})`);
  return json as T;
}

export const plaidConnector: LiveConnector = {
  id: "plaid",
  connectVia: "plaid-link",

  isConfigured() {
    return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
  },

  async sync(_connection, _since, { accessToken, cursor }) {
    if (!accessToken) throw new Error("Bank sign-in is missing; reconnect the bank.");
    const money: MappedMoney[] = [];
    const removed: string[] = [];
    let next = cursor;
    for (let i = 0; i < 100; i++) {
      const r = await plaid<{ added: PlaidTxn[]; modified: PlaidTxn[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean }>(
        "/transactions/sync",
        { access_token: accessToken, cursor: next, count: 500 },
      );
      for (const t of [...r.added, ...r.modified]) money.push(...mapPlaidTxn(t));
      removed.push(...r.removed.map((x) => x.transaction_id));
      next = r.next_cursor;
      if (!r.has_more) break;
    }
    const acc = await plaid<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: accessToken });
    const balances = acc.accounts.map(mapPlaidAccount).filter((b): b is MappedBalance => b !== null);
    return { money, balances, removedMoneyIds: removed, cursor: next };
  },

  async disconnect(_connection, { accessToken }) {
    if (accessToken) await plaid("/item/remove", { access_token: accessToken });
  },
};
