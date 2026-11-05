import "server-only";
import type { LiveConnector } from "./types";
import { stripeConnector } from "./stripe";

const LIVE: Record<string, LiveConnector> = {
  stripe: stripeConnector,
};

export function liveConnector(id: string): LiveConnector | undefined {
  return LIVE[id];
}
