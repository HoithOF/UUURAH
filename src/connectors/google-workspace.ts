import "server-only";
import type { LiveConnector, MappedEvent } from "./types";
import { mapGoogleEvent, type GoogleEvent } from "./comm-map";
import { buildRawEmail } from "./raw-email";
import { googleAuthorizeUrl, googleConfigured, googleEmail, googleExchange, googleRefresh, googleRevoke } from "@/lib/google-oauth";

// Google Calendar (read and respond) plus Gmail SEND only. gmail.send is a "sensitive" scope:
// it needs Google's standard verification but not the paid CASA assessment that reading the
// inbox requires. Full Gmail inbox reading is a later upgrade.

const CAL = "https://www.googleapis.com/auth/calendar.events";
const SEND = "https://www.googleapis.com/auth/gmail.send";

async function gapi<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Google request failed (${res.status})`);
  return body as T;
}

export const googleWorkspaceConnector: LiveConnector = {
  id: "google-calendar",
  connectVia: "redirect",
  isConfigured: googleConfigured,

  authorizeUrl(state, redirectUri) {
    return googleAuthorizeUrl([CAL, SEND], state, redirectUri);
  },

  async exchangeCode(code, redirectUri) {
    const t = await googleExchange(code, redirectUri);
    const email = (await googleEmail(t.accessToken)) ?? "Google account";
    return { externalAccountId: email, displayName: `Google: ${email}`, scopes: `${CAL} ${SEND}`, ...t };
  },

  refresh: googleRefresh,

  async sync(_c, _since, { accessToken }) {
    if (!accessToken) throw new Error("Google sign-in is missing; reconnect Google.");
    const p = new URLSearchParams({ timeMin: new Date(Date.now() - 864e5).toISOString(), timeMax: new Date(Date.now() + 14 * 864e5).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const r = await gapi<{ items: GoogleEvent[] }>(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
    const events = r.items.map(mapGoogleEvent).filter((e): e is MappedEvent => e !== null);
    return { money: [], events };
  },

  async disconnect(_c, { accessToken }) {
    if (accessToken) await googleRevoke(accessToken);
  },
};

export const googleActions = {
  respond: async (token: string, eventId: string, response: "accepted" | "tentative" | "declined") => {
    const ev = await gapi<GoogleEvent>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`);
    const attendees = (ev.attendees ?? []).map((a) => (a.self ? { ...a, responseStatus: response } : a));
    await gapi(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify({ attendees }) });
  },
  send: (token: string, from: string, to: string, subject: string, text: string) =>
    gapi(token, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: buildRawEmail(from, to, subject, text) }) }),
};
