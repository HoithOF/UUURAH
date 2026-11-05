import { test } from "node:test";
import assert from "node:assert/strict";
import { alertDue, alertEmail, localParts, shouldSend } from "../src/lib/alerts-core.ts";

// Monday 2026-11-09 13:00 UTC = 08:00 in New York, 05:00 in Los Angeles.
const MON_13Z = new Date("2026-11-09T13:00:00Z");

test("localParts uses the user's time zone", () => {
  assert.deepEqual(localParts(MON_13Z, "America/New_York"), { hour: 8, weekday: 1 });
  assert.deepEqual(localParts(MON_13Z, "America/Los_Angeles"), { hour: 5, weekday: 1 });
});

test("nothing before 7am local, nothing when off", () => {
  assert.equal(alertDue("daily", null, MON_13Z, "America/Los_Angeles"), false);
  assert.equal(alertDue("off", null, MON_13Z, "America/New_York"), false);
});

test("daily sends once a day", () => {
  assert.equal(alertDue("daily", null, MON_13Z, "America/New_York"), true);
  assert.equal(alertDue("daily", new Date(MON_13Z.getTime() - 3600_000), MON_13Z, "America/New_York"), false);
  assert.equal(alertDue("daily", new Date(MON_13Z.getTime() - 24 * 3600_000), MON_13Z, "America/New_York"), true);
});

test("weekly sends on Monday only, once", () => {
  assert.equal(alertDue("weekly", null, MON_13Z, "America/New_York"), true);
  assert.equal(alertDue("weekly", new Date(MON_13Z.getTime() - 2 * 3600_000), MON_13Z, "America/New_York"), false);
  const tue = new Date("2026-11-10T13:00:00Z");
  assert.equal(alertDue("weekly", null, tue, "America/New_York"), false);
});

const warn = { severity: "warning" as const, title: "Sales are down 30%", detail: "Compared with the 30 days before.", section: "money" };
const crit = { severity: "critical" as const, title: "Cash runs out in 2 months", detail: "At this month's burn.", section: "money" };

test("daily only sends when something is wrong", () => {
  assert.equal(shouldSend("daily", []), false);
  assert.equal(shouldSend("daily", [{ ...warn, severity: "good" }]), false);
  assert.equal(shouldSend("daily", [warn]), true);
  assert.equal(shouldSend("weekly", []), true);
});

test("email subject and body", () => {
  const e = alertEmail("Acme", "daily", [crit, warn], [{ area: "money", status: "critical", headline: "Cash runs out in 2 months" }, { area: "sales", status: "not-connected", headline: "x" }], "https://x/dashboard", "https://x/settings");
  assert.equal(e.subject, "2 things need attention at Acme (1 urgent)");
  assert.match(e.text, /1\. Cash runs out in 2 months/);
  assert.match(e.text, /🔴 Money/);
  assert.doesNotMatch(e.text, /Sales:/);
  assert.equal(alertEmail("Acme", "weekly", [], [], "u", "s").subject, "Acme looks healthy this week");
});
