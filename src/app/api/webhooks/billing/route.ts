import { NextResponse } from "next/server";
import { verifyStripeWebhook } from "@/connectors/stripe-map";
import { applySubscription, fetchSubscription } from "@/lib/billing";

// Stripe Billing webhook for our own subscriptions (separate endpoint and secret from Stripe Connect).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const payload = await req.text();
  let event;
  try {
    event = verifyStripeWebhook(payload, req.headers.get("stripe-signature"), secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const obj = event.data.object as Record<string, unknown>;
  if (event.type === "checkout.session.completed" && typeof obj.subscription === "string") {
    await applySubscription(await fetchSubscription(obj.subscription));
  } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(event.type)) {
    await applySubscription(obj as unknown as Parameters<typeof applySubscription>[0]);
  }
  return NextResponse.json({ received: true });
}
