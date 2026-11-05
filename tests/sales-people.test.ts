import { test } from "node:test";
import assert from "node:assert/strict";
import { mapHubSpotDeal, mapMergeEmployee, mapMergePayrollRuns } from "../src/connectors/crm-hr-map.ts";
import { peopleSignals, peopleSummary, salesSignals, salesSummary } from "../src/lib/metrics-core.ts";

const stages = { s1: { id: "s1", label: "Proposal sent", metadata: { isClosed: "false", probability: "0.6" } }, won: { id: "won", label: "Closed won", metadata: { isClosed: "true", probability: "1.0" } } };

test("HubSpot deals: stage labels, won flag, latest activity, link", () => {
  const d = mapHubSpotDeal({ id: "9", properties: { dealname: "Ruiz roof", amount: "18500", dealstage: "s1", createdate: "2026-09-01T00:00:00Z", notes_last_updated: "2026-10-01T00:00:00Z", notes_last_contacted: "2026-10-03T00:00:00Z" } }, stages, "usd", "123");
  assert.deepEqual([d.stage, d.amountCents, d.isClosed, d.currency], ["Proposal sent", 1850000, false, "USD"]);
  assert.equal(d.lastActivityAt?.toISOString(), "2026-10-03T00:00:00.000Z");
  assert.equal(d.webLink, "https://app.hubspot.com/contacts/123/record/0-3/9");
  assert.equal(mapHubSpotDeal({ id: "1", properties: { dealstage: "won" } }, stages, "USD", null).isWon, true);
});

test("Merge payroll: runs summed from employee lines; unpaid runs skipped", () => {
  const runs = mapMergePayrollRuns(
    [{ id: "r1", run_state: "PAID", check_date: "2026-10-15T00:00:00Z" }, { id: "r2", run_state: "DRAFT", check_date: "2026-10-30T00:00:00Z" }],
    [{ payroll_run: "r1", gross_pay: 2000, net_pay: 1500 }, { payroll_run: "r1", gross_pay: 3000.5, net_pay: 2200 }, { payroll_run: "r2", gross_pay: 999 }],
  );
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].grossCents, runs[0].netCents, runs[0].people], [500050, 370000, 2]);
  assert.equal(mapMergeEmployee({ id: "e", first_name: "Ana", last_name: "Diaz", employment_status: "INACTIVE" })?.status, "inactive");
  assert.equal(mapMergeEmployee({ id: "x", remote_was_deleted: true }), null);
});

const now = new Date("2026-11-01T00:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 864e5);

test("sales: cold deals, past close date, win rate", () => {
  const s = salesSummary([
    { name: "A", amountCents: 500000, isClosed: false, isWon: false, closeDate: day(5), openedAt: day(40), lastActivityAt: day(20) },
    { name: "B", amountCents: 100000, isClosed: false, isWon: false, closeDate: null, openedAt: day(3), lastActivityAt: null },
    { name: "C", amountCents: 100000, isClosed: true, isWon: true, closeDate: day(10), openedAt: day(50), lastActivityAt: null },
    { name: "D", amountCents: 100000, isClosed: true, isWon: false, closeDate: day(9), openedAt: day(50), lastActivityAt: null },
  ], now);
  assert.deepEqual([s.openCount, s.pipeline, s.wonCount30, s.winRate30, s.stale.length, s.pastClose.length], [2, 600000, 1, 0.5, 1, 1]);
  assert.equal(salesSignals(s)[0].title, "1 deal with no follow-up in 2 weeks");
});

test("people: labor share and payroll outrunning sales", () => {
  const p = peopleSummary([{ checkDate: day(10), grossCents: 600000 }, { checkDate: day(40), grossCents: 400000 }], 8, 1000000, 1000000, now);
  assert.equal(p.laborShare, 0.6);
  const titles = peopleSignals(p).map((x) => x.title);
  assert.deepEqual(titles, ["Payroll is 60% of sales", "Payroll up 50% while sales grew 0%"]);
});
