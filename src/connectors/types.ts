import type { Connection } from "@prisma/client";
import type { MappedMoney } from "./stripe-map";

export interface OAuthResult {
  externalAccountId: string;
  displayName: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

export interface SyncContext {
  // Decrypted access token, already refreshed if it was close to expiring.
  accessToken?: string;
  cursor?: string;
}

export interface MappedInvoice {
  externalId: string;
  direction: "receivable" | "payable"; // owed to us | owed by us
  number: string | null;
  contact: string | null;
  totalCents: number;
  balanceCents: number;
  currency: string;
  issuedAt: Date;
  dueAt: Date | null;
  status: string;
}

export interface MappedBalance {
  accountId: string;
  name: string;
  type: string;
  currentCents: number;
  currency: string;
}

export interface MappedAdDay {
  campaignId: string;
  campaignName: string;
  date: Date; // UTC midnight of the ad account's reporting day
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueCents: number;
  currency: string;
}

export interface MappedMessage {
  externalId: string;
  threadId: string | null;
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  preview: string | null;
  receivedAt: Date;
  isRead: boolean;
  needsReply: boolean;
  webLink: string | null;
}

export interface MappedEvent {
  externalId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  myResponse: string | null;
  attendees: number;
  webLink: string | null;
}

export interface SyncResult {
  money: MappedMoney[];
  // When present, these REPLACE the connection's stored messages / events (they are rolling windows).
  messages?: MappedMessage[];
  events?: MappedEvent[];
  ads?: MappedAdDay[];
  invoices?: MappedInvoice[];
  balances?: MappedBalance[];
  // Money rows the app says were deleted on its side.
  removedMoneyIds?: string[];
  // Saved and handed back as `ctx.cursor` next time, for apps with cursor-based sync.
  cursor?: string;
}

// What every live connector implements. Adding a new app means writing one of these
// and registering it in registry.ts.
export interface LiveConnector {
  id: string;
  // "redirect": the standard OAuth round trip through /api/connect/<id>/start.
  // "plaid-link": Plaid's in-page Link widget (see components/PlaidConnect.tsx).
  connectVia: "redirect" | "plaid-link";
  isConfigured(): boolean;
  authorizeUrl?(state: string, redirectUri: string): string;
  // `params` is the full callback query string (QuickBooks sends its company id there).
  exchangeCode?(code: string, redirectUri: string, params: URLSearchParams): Promise<OAuthResult>;
  refresh?(refreshToken: string): Promise<TokenSet>;
  sync(connection: Connection, since: Date | null, ctx: SyncContext): Promise<SyncResult>;
  disconnect?(connection: Connection, ctx: SyncContext): Promise<void>;
}
