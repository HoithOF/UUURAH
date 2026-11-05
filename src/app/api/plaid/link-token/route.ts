import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { plaid, plaidConnector } from "@/connectors/plaid";

// Step 1 of connecting a bank: a short-lived token that opens Plaid Link in the browser.
export async function POST() {
  const { user, workspace } = await requireWorkspace("admin");
  if (!plaidConnector.isConfigured()) return NextResponse.json({ error: "Plaid isn't set up on the server." }, { status: 503 });
  const r = await plaid<{ link_token: string }>("/link/token/create", {
    user: { client_user_id: `${workspace.id}:${user.id}` },
    client_name: "UUURAH",
    products: ["transactions"],
    transactions: { days_requested: 365 },
    country_codes: ["US", "CA"],
    language: "en",
  });
  return NextResponse.json({ linkToken: r.link_token });
}
