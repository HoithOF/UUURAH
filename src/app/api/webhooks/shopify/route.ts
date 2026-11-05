import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validWebhookHmac } from "@/connectors/shopify-map";

// Shopify app webhooks: app/uninstalled plus the mandatory privacy topics.
// We keep only order totals and order numbers (no customer names, emails or addresses),
// so customer data requests have nothing to return or erase.
export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  if (!validWebhookHmac(raw, req.headers.get("x-shopify-hmac-sha256"), secret)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";
  if ((topic === "app/uninstalled" || topic === "shop/redact") && shop) {
    const conns = await db.connection.findMany({ where: { provider: "shopify", externalAccountId: shop } });
    for (const c of conns)
      await db.$transaction([db.moneyTransaction.deleteMany({ where: { connectionId: c.id } }), db.connection.delete({ where: { id: c.id } })]);
  }
  return NextResponse.json({ ok: true });
}
