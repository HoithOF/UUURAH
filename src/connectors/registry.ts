import "server-only";
import type { LiveConnector } from "./types";
import { stripeConnector } from "./stripe";
import { squareConnector } from "./square";
import { quickbooksConnector } from "./quickbooks";
import { xeroConnector } from "./xero";
import { plaidConnector } from "./plaid";

const LIVE: Record<string, LiveConnector> = {
  stripe: stripeConnector,
  square: squareConnector,
  quickbooks: quickbooksConnector,
  xero: xeroConnector,
  plaid: plaidConnector,
};

export function liveConnector(id: string): LiveConnector | undefined {
  return LIVE[id];
}
