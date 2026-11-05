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

export interface SyncResult {
  money: MappedMoney[];
}

// What every live connector implements. Adding Square or QuickBooks means writing one of these.
export interface LiveConnector {
  id: string;
  isConfigured(): boolean;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<OAuthResult>;
  sync(connection: Connection, since: Date | null): Promise<SyncResult>;
  disconnect?(connection: Connection): Promise<void>;
}
