import "server-only";
import type { LiveConnector } from "./types";
import { stripeConnector } from "./stripe";
import { squareConnector } from "./square";
import { quickbooksConnector } from "./quickbooks";
import { xeroConnector } from "./xero";
import { plaidConnector } from "./plaid";
import { googleAdsConnector } from "./google-ads";
import { metaAdsConnector } from "./meta-ads";
import { outlookConnector } from "./outlook";
import { googleWorkspaceConnector } from "./google-workspace";
import { hubspotConnector } from "./hubspot";
import { mergeHrisConnector } from "./merge-hris";
import { shopifyConnector } from "./shopify";

const LIVE: Record<string, LiveConnector> = {
  stripe: stripeConnector,
  square: squareConnector,
  quickbooks: quickbooksConnector,
  xero: xeroConnector,
  plaid: plaidConnector,
  "google-ads": googleAdsConnector,
  "meta-ads": metaAdsConnector,
  outlook: outlookConnector,
  "google-calendar": googleWorkspaceConnector,
  hubspot: hubspotConnector,
  "merge-hris": mergeHrisConnector,
  shopify: shopifyConnector,
};

export function liveConnector(id: string): LiveConnector | undefined {
  return LIVE[id];
}
