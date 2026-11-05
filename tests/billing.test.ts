import { test } from "node:test";
import assert from "node:assert/strict";
import { access, subscriptionFields } from "../src/lib/billing-core.ts";

const now = new Date("2026-11-05T12:00:00Z");
const day = 864e5;

test("everything is free until billing is switched on", () => {
  assert.deepEqual(access({ trialEndsAt: null, subscriptionStatus: null, currentPeriodEnd: null }, false, now), { ok: true, reason: "free" });
});

test("trial counts down, then ends", () => {
  assert.deepEqual(access({ trialEndsAt: new Date(now.getTime() + 3.5 * day), subscriptionStatus: null, currentPeriodEnd: null }, true, now), { ok: true, reason: "trial", daysLeft: 4 });
  assert.equal(access({ trialEndsAt: new Date(now.getTime() - day), subscriptionStatus: null, currentPeriodEnd: null }, true, now).reason, "trial-ended");
});

test("paid, grace period, lapsed", () => {
  assert.equal(access({ trialEndsAt: null, subscriptionStatus: "active", currentPeriodEnd: null }, true, now).reason, "paid");
  assert.equal(access({ trialEndsAt: null, subscriptionStatus: "past_due", currentPeriodEnd: new Date(now.getTime() - 2 * day) }, true, now).reason, "grace");
  assert.equal(access({ trialEndsAt: null, subscriptionStatus: "past_due", currentPeriodEnd: new Date(now.getTime() - 9 * day) }, true, now).ok, false);
  assert.equal(access({ trialEndsAt: new Date(now.getTime() + day), subscriptionStatus: "canceled", currentPeriodEnd: null }, true, now).reason, "lapsed");
});

test("reads period end from the item (new API) or the subscription (old API)", () => {
  assert.equal(subscriptionFields({ id: "sub_1", status: "active", items: { data: [{ current_period_end: 1800000000 }] } }).currentPeriodEnd?.getTime(), 1800000000000);
  assert.equal(subscriptionFields({ id: "sub_1", status: "active", current_period_end: 1700000000 }).currentPeriodEnd?.getTime(), 1700000000000);
});
