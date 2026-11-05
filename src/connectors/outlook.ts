import "server-only";
import type { Connection } from "@prisma/client";
import type { LiveConnector, MappedEvent, TokenSet } from "./types";
import { computeNeedsReply, mapGraphEvent, mapGraphMessage, type GraphEvent, type GraphMessage } from "./comm-map";

// Outlook / Microsoft 365 mail and calendar through Microsoft Graph.
// Mail.Read reads headers and previews; Mail.Send and Calendars.ReadWrite power reply and accept.

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access openid email User.Read Mail.Read Mail.Send Calendars.ReadWrite";

async function tokenCall(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, client_secret: process.env.MICROSOFT_CLIENT_SECRET!, scope: SCOPES, ...body }),
  });
  const t = await res.json();
  if (!res.ok) throw new Error(t.error_description?.split("\r\n")[0] ?? t.error ?? `Microsoft sign-in failed (${res.status})`);
  return { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) };
}

export async function graph<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC"', ...(init.headers as Record<string, string>) },
  });
  if (res.status === 202 || res.status === 204) return {} as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Microsoft Graph request failed (${res.status})`);
  return body as T;
}

async function list<T>(token: string, path: string, max = 500): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  while (next && out.length < max) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(token, next);
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const outlookConnector: LiveConnector = {
  id: "outlook",
  connectVia: "redirect",

  isConfigured() {
    return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  },

  authorizeUrl(state, redirectUri) {
    const p = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID!, response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: SCOPES, state });
    return `${AUTH}/authorize?${p}`;
  },

  async exchangeCode(code, redirectUri) {
    const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const me = await graph<{ id: string; mail?: string; userPrincipalName?: string; displayName?: string }>(t.accessToken, "/me?$select=id,mail,userPrincipalName,displayName");
    const email = me.mail ?? me.userPrincipalName ?? me.id;
    return { externalAccountId: me.id, displayName: `Outlook: ${email}`, scopes: SCOPES, ...t };
  },

  refresh(refreshToken) {
    return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  async sync(connection: Connection, _since, { accessToken }) {
    if (!accessToken) throw new Error("Microsoft sign-in is missing; reconnect Outlook.");
    const me = await graph<{ mail?: string; userPrincipalName?: string }>(accessToken, "/me?$select=mail,userPrincipalName");
    const myEmail = me.mail ?? me.userPrincipalName ?? null;
    const since = iso(new Date(Date.now() - 14 * 864e5));
    const fields = "id,conversationId,subject,bodyPreview,receivedDateTime,sentDateTime,isRead,webLink,from,inferenceClassification";
    const inbox = await list<GraphMessage>(accessToken, `/me/mailFolders/inbox/messages?$select=${fields}&$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=100`, 300);
    const sent = await list<GraphMessage>(accessToken, `/me/mailFolders/sentitems/messages?$select=id,conversationId,sentDateTime&$filter=sentDateTime ge ${since}&$top=100`, 500);
    const needs = computeNeedsReply(inbox, sent, myEmail);
    const messages = inbox.map((m) => mapGraphMessage(m, needs.get(m.id) ?? false));

    const from = iso(new Date(Date.now() - 864e5));
    const to = iso(new Date(Date.now() + 14 * 864e5));
    const raw = await list<GraphEvent>(accessToken, `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$select=id,subject,isAllDay,isCancelled,start,end,location,organizer,isOrganizer,responseStatus,attendees,webLink&$orderby=start/dateTime&$top=100`, 500);
    const events = raw.map(mapGraphEvent).filter((e): e is MappedEvent => e !== null);
    return { money: [], messages, events };
  },
};

// Write-back actions used by the Communication page.
export const outlookActions = {
  reply: (token: string, messageId: string, text: string) =>
    graph(token, `/me/messages/${encodeURIComponent(messageId)}/reply`, { method: "POST", body: JSON.stringify({ comment: text }) }),
  respond: (token: string, eventId: string, response: "accept" | "tentativelyAccept" | "decline") =>
    graph(token, `/me/events/${encodeURIComponent(eventId)}/${response}`, { method: "POST", body: JSON.stringify({ sendResponse: true }) }),
  send: (token: string, to: string, subject: string, text: string) =>
    graph(token, "/me/sendMail", { method: "POST", body: JSON.stringify({ message: { subject, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: to } }] } }) }),
};
