import { requireWorkspace } from "@/lib/workspace";
import { billingEnabled, workspaceAccess } from "@/lib/billing";
import { fmtDate } from "@/lib/dates";
import { manageBilling, subscribe } from "./actions";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { user, workspace, role } = await requireWorkspace();
  const { done } = await searchParams;
  const a = workspaceAccess(workspace);
  const price = process.env.BILLING_PRICE_LABEL ?? "per month";
  return (
    <>
      <h1>Billing</h1>
      {!billingEnabled() ? (
        <p className="muted">Billing isn&apos;t switched on for this site, so {workspace.name} uses everything free.</p>
      ) : (
        <div className="card" style={{ maxWidth: 560 }}>
          {done && <div className="note">Thanks! Your subscription is being set up; this page updates within a minute.</div>}
          <div style={{ fontWeight: 600, fontSize: 17 }}>
            {a.reason === "paid" ? "Subscribed" : a.reason === "trial" ? `Free trial: ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"} left` : a.reason === "grace" ? "Payment problem" : a.reason === "trial-ended" ? "Your free trial has ended" : "Subscription ended"}
          </div>
          <p className="small">
            {a.reason === "paid" && workspace.currentPeriodEnd && <>Renews {fmtDate(workspace.currentPeriodEnd, user.timeZone)}. </>}
            {a.reason === "grace" && <>Your last payment didn&apos;t go through. Update your card to keep access. </>}
            {!a.ok && <>Subscribe to keep seeing your numbers. Your data and connections are kept safe in the meantime. </>}
            {a.reason === "trial" && <>Everything is included during the trial. No card needed until you subscribe. </>}
            One plan, {price}, for the whole team.
          </p>
          {role !== "owner" ? (
            <p className="small muted">Only the owner can change billing.</p>
          ) : workspace.subscriptionId && a.reason !== "lapsed" ? (
            <form action={manageBilling}><button className="btn">Manage billing and invoices</button></form>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <form action={subscribe}><button className="btn primary">Subscribe</button></form>
              {workspace.stripeCustomerId && <form action={manageBilling}><button className="btn">Past invoices</button></form>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
