export type BillingState = { trialEndsAt: Date | null; subscriptionStatus: string | null; currentPeriodEnd: Date | null };

export type Access = { ok: boolean; reason: "free" | "trial" | "paid" | "grace" | "trial-ended" | "lapsed"; daysLeft?: number };

const PAID = ["active", "trialing"];

/** Whether a company can use the app right now. `enforced` is false until billing is switched on. */
export function access(ws: BillingState, enforced: boolean, now = new Date()): Access {
  if (!enforced) return { ok: true, reason: "free" };
  if (ws.subscriptionStatus && PAID.includes(ws.subscriptionStatus)) return { ok: true, reason: "paid" };
  // A failed renewal keeps working for 7 days while Stripe retries the card.
  if (ws.subscriptionStatus === "past_due") {
    const end = ws.currentPeriodEnd ? ws.currentPeriodEnd.getTime() + 7 * 864e5 : 0;
    return end > now.getTime() ? { ok: true, reason: "grace" } : { ok: false, reason: "lapsed" };
  }
  if (ws.trialEndsAt && ws.trialEndsAt > now && !ws.subscriptionStatus) {
    return { ok: true, reason: "trial", daysLeft: Math.ceil((ws.trialEndsAt.getTime() - now.getTime()) / 864e5) };
  }
  return { ok: false, reason: ws.subscriptionStatus ? "lapsed" : "trial-ended" };
}

/** Maps a Stripe subscription object to the fields we store. */
export function subscriptionFields(sub: { id: string; status: string; items?: { data?: { current_period_end?: number }[] }; current_period_end?: number }) {
  const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return { subscriptionId: sub.id, subscriptionStatus: sub.status, currentPeriodEnd: end ? new Date(end * 1000) : null };
}
