import "server-only";
import type { LiveConnector } from "./types";
import { stripeConnector } from "./stripe";
import { squareConnector } from "./square";
import { quickbooksConnector } from "./quickbooks";
import { xeroConnector } from "./xero";
import { plaidConnector } from "./plaid";
import { googleAdsConnector } from "./google-ads";
import { metaAdsConnector } from "./meta-ads";

const LIVE: Record<string, LiveConnector> = {
  stripe: stripeConnector,
  square: squareConnector,
  quickbooks: quickbooksConnector,
  xero: xeroConnector,
  plaid: plaidConnector,
  "google-ads": googleAdsConnector,
  "meta-ads": metaAdsConnector,
};

export function liveConnector(id: string): LiveConnector | undefined {
  return LIVE[id];
}
