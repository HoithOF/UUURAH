import type { MappedEvent, MappedMessage } from "./types";

// Pure mapping for Microsoft Graph mail/calendar and Google Calendar.

const AUTOMATED = /(no-?reply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce|news(letter)?|marketing|updates?|alerts?|billing|receipts?|support@.*zendesk)/i;

export function looksAutomated(email: string | null | undefined, subject?: string | null) {
  if (!email) return true;
  if (AUTOMATED.test(email.split("@")[0]) || /@(.*\.)?(mailchimp|sendgrid|hubspotemail|amazonses|intercom-mail)\./i.test(email)) return true;
  return /^(your (receipt|order|invoice|statement)|unsubscribe|newsletter)/i.test(subject ?? "");
}

export interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string | null;
  bodyPreview?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  inferenceClassification?: "focused" | "other";
}

// An inbox email "needs a reply" when a real person wrote it, it landed in Focused, and nothing
// was sent back in that conversation afterwards.
export function computeNeedsReply(inbox: GraphMessage[], sent: GraphMessage[], myEmail: string | null): Map<string, boolean> {
  const lastSent = new Map<string, number>();
  for (const s of sent) {
    if (!s.conversationId) continue;
    const t = Date.parse(s.sentDateTime ?? s.receivedDateTime ?? "");
    if (t > (lastSent.get(s.conversationId) ?? 0)) lastSent.set(s.conversationId, t);
  }
  const out = new Map<string, boolean>();
  for (const m of inbox) {
    const from = m.from?.emailAddress?.address?.toLowerCase() ?? null;
    const received = Date.parse(m.receivedDateTime ?? "");
    const answered = m.conversationId ? (lastSent.get(m.conversationId) ?? 0) >= received : false;
    const fromMe = !!myEmail && from === myEmail.toLowerCase();
    out.set(m.id, !answered && !fromMe && m.inferenceClassification !== "other" && !looksAutomated(from, m.subject));
  }
  return out;
}

export function mapGraphMessage(m: GraphMessage, needsReply: boolean): MappedMessage {
  return {
    externalId: m.id,
    threadId: m.conversationId ?? null,
    fromName: m.from?.emailAddress?.name ?? null,
    fromEmail: m.from?.emailAddress?.address ?? null,
    subject: m.subject ?? null,
    preview: (m.bodyPreview ?? "").slice(0, 300) || null,
    receivedAt: new Date(m.receivedDateTime ?? Date.now()),
    isRead: !!m.isRead,
    needsReply,
    webLink: m.webLink ?? null,
  };
}

export interface GraphEvent {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isOrganizer?: boolean;
  responseStatus?: { response?: string };
  attendees?: unknown[];
  webLink?: string;
}

// We request Graph times in UTC (Prefer: outlook.timezone="UTC"), which come without a zone suffix.
const graphTime = (s: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

const GRAPH_RESPONSE: Record<string, string> = { accepted: "accepted", tentativelyAccepted: "tentative", declined: "declined", notResponded: "needsAction", none: "needsAction", organizer: "organizer" };

export function mapGraphEvent(e: GraphEvent): MappedEvent | null {
  if (e.isCancelled) return null;
  return {
    externalId: e.id,
    title: e.subject || "(no title)",
    startsAt: graphTime(e.start.dateTime),
    endsAt: graphTime(e.end.dateTime),
    allDay: !!e.isAllDay,
    location: e.location?.displayName || null,
    organizer: e.organizer?.emailAddress?.name ?? e.organizer?.emailAddress?.address ?? null,
    myResponse: e.isOrganizer ? "organizer" : GRAPH_RESPONSE[e.responseStatus?.response ?? "none"] ?? null,
    attendees: e.attendees?.length ?? 0,
    webLink: e.webLink ?? null,
  };
}

export interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
  htmlLink?: string;
}

export function mapGoogleEvent(e: GoogleEvent): MappedEvent | null {
  if (e.status === "cancelled") return null;
  const allDay = !e.start.dateTime;
  const start = e.start.dateTime ?? `${e.start.date}T00:00:00Z`;
  const end = e.end.dateTime ?? `${e.end.date}T00:00:00Z`;
  const me = e.attendees?.find((a) => a.self);
  return {
    externalId: e.id,
    title: e.summary || "(no title)",
    startsAt: new Date(start),
    endsAt: new Date(end),
    allDay,
    location: e.location ?? null,
    organizer: e.organizer?.displayName ?? e.organizer?.email ?? null,
    myResponse: e.organizer?.self ? "organizer" : me?.responseStatus ?? (e.attendees ? null : "organizer"),
    attendees: e.attendees?.length ?? 0,
    webLink: e.htmlLink ?? null,
  };
}
