import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGoogleAdsRow, mapMetaInsight } from "../src/connectors/ads-map.ts";
import { adSignals, adTotals, type AdRow } from "../src/lib/metrics-core.ts";

test("Google Ads micros become cents", () => {
  const r = mapGoogleAdsRow({ campaign: { id: "11", name: "Search - Roofing" }, segments: { date: "2026-10-02" }, metrics: { costMicros: "12345678", impressions: "1000", clicks: "40", conversions: 3.5, conversionsValue: 900.25 }, customer: { currencyCode: "usd" } })!;
  assert.deepEqual([r.spendCents, r.clicks, r.conversions, r.conversionValueCents, r.currency], [1235, 40, 3.5, 90025, "USD"]);
  assert.equal(r.date.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("Meta counts one conversion type, not every duplicate", () => {
  const r = mapMetaInsight({ campaign_id: "c1", campaign_name: "Retargeting", date_start: "2026-10-03", spend: "50.10", impressions: "2000", clicks: "30",
    actions: [{ action_type: "link_click", value: "30" }, { action_type: "omni_purchase", value: "4" }, { action_type: "purchase", value: "4" }],
    action_values: [{ action_type: "purchase", value: "320.00" }] }, "usd")!;
  assert.deepEqual([r.spendCents, r.conversions, r.conversionValueCents], [5010, 4, 32000]);
});

const row = (name: string, spend: number, conv: number, value = 0, date = "2026-10-10"): AdRow => ({ source: "meta-ads", campaignId: name, campaignName: name, date: new Date(date), spendCents: spend, impressions: 1000, clicks: 10, conversions: conv, conversionValueCents: value });

test("wasted spend and a losing return are flagged", () => {
  const s = adSignals([row("Brand", 50000, 0), row("Promo", 20000, 5, 10000)], [], 100000, 100000);
  const titles = s.map((x) => x.title);
  assert.ok(titles.some((t) => t.includes("with no results")));
  assert.ok(titles.some((t) => t.startsWith("Ads return")));
});

test("spend outrunning sales is flagged", () => {
  const s = adSignals([row("A", 30000, 10, 90000)], [row("A", 20000, 10, 60000, "2026-09-10")], 100000, 100000);
  assert.ok(s.some((x) => x.title.startsWith("Ad spend up 50%")));
});

test("totals", () => {
  const t = adTotals([row("A", 10000, 4, 40000), row("B", 10000, 0)]);
  assert.equal(t.costPerConversion, 5000);
  assert.equal(t.roas, 2);
});
