import "server-only";
import type { TokenSet } from "@/connectors/types";

// Shared Google sign-in for Google Ads, Analytics, Calendar and Gmail.
export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleAuthorizeUrl(scopes: string[], state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ["openid", "email", ...scopes].join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH}?${p}`;
}

async function token(body: Record<string, string>): Promise<TokenSet & { idToken?: string }> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description ?? t.error ?? `Google sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000), idToken: t.id_token };
}

export const googleExchange = (code: string, redirectUri: string) => token({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
export const googleRefresh = (refreshToken: string) => token({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function googleEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.ok ? ((await res.json()).email as string) : undefined;
}

export async function googleRevoke(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" });
}
