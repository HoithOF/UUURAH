import type { MappedAdDay } from "./types";

// Pure mapping for Google Ads and Meta Ads reporting rows.

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

export interface GoogleAdsRow {
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string | number; impressions?: string | number; clicks?: string | number; conversions?: number; conversionsValue?: number };
  customer?: { currencyCode?: string };
}

export function mapGoogleAdsRow(r: GoogleAdsRow): MappedAdDay | null {
  if (!r.campaign?.id || !r.segments?.date) return null;
  const m = r.metrics ?? {};
  return {
    campaignId: String(r.campaign.id),
    campaignName: r.campaign.name ?? `Campaign ${r.campaign.id}`,
    date: day(r.segments.date),
    spendCents: Math.round(Number(m.costMicros ?? 0) / 10_000), // micros -> cents
    impressions: Number(m.impressions ?? 0),
    clicks: Number(m.clicks ?? 0),
    conversions: Number(m.conversions ?? 0),
    conversionValueCents: Math.round(Number(m.conversionsValue ?? 0) * 100),
    currency: (r.customer?.currencyCode ?? "USD").toUpperCase(),
  };
}

export interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

// What counts as a "conversion" on Meta: purchases and leads, the outcomes small businesses buy ads for.
// Meta reports the same purchase under several action types, so take the first one present, not the sum.
const CONVERSION_PRIORITY = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase", "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

function pickAction(list: { action_type: string; value: string }[] | undefined) {
  if (!list) return 0;
  for (const type of CONVERSION_PRIORITY) {
    const hit = list.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

export function mapMetaInsight(r: MetaInsightRow, currency: string): MappedAdDay | null {
  if (!r.campaign_id) return null;
  return {
    campaignId: r.campaign_id,
    campaignName: r.campaign_name ?? `Campaign ${r.campaign_id}`,
    date: day(r.date_start),
    spendCents: Math.round(Number(r.spend ?? 0) * 100),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    conversions: pickAction(r.actions),
    conversionValueCents: Math.round(pickAction(r.action_values) * 100),
    currency: currency.toUpperCase(),
  };
}
