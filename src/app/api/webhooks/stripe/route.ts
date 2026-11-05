import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { runSync } from "@/lib/sync";
import { verifyStripeWebhook } from "@/connectors/stripe-map";

// Stripe Connect webhook: any money event on a connected account triggers a sync of that account.
const MONEY_EVENTS = /^(charge\.|payout\.|balance\.available|refund\.|payment_intent\.succeeded|account\.application\.deauthorized)/;

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const payload = await req.text();
  let event;
  try {
    event = verifyStripeWebhook(payload, req.headers.get("stripe-signature"), secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  if (!event.account || !MONEY_EVENTS.test(event.type)) return NextResponse.json({ received: true });

  const connections = await db.connection.findMany({ where: { provider: "stripe", externalAccountId: event.account, status: { not: "disconnected" } } });
  if (event.type === "account.application.deauthorized") {
    await db.connection.updateMany({ where: { id: { in: connections.map((c) => c.id) } }, data: { status: "disconnected", lastError: "Access was removed from the Stripe side." } });
  } else {
    after(async () => {
      for (const c of connections) await runSync(c.id, "webhook");
    });
  }
  return NextResponse.json({ received: true });
}
