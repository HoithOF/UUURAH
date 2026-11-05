import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNeedsReply, looksAutomated, mapGoogleEvent, mapGraphEvent } from "../src/connectors/comm-map.ts";
import { buildRawEmail } from "../src/connectors/raw-email.ts";
import { commSignals } from "../src/lib/metrics-core.ts";

test("automated senders are not people waiting on you", () => {
  assert.ok(looksAutomated("no-reply@stripe.com"));
  assert.ok(looksAutomated("news@shop.com"));
  assert.ok(looksAutomated("bob@em.mailchimp.com"));
  assert.ok(!looksAutomated("jane@acme.com", "Quote for the roof?"));
});

test("an email needs a reply until something is sent in that conversation", () => {
  const inbox = [
    { id: "a", conversationId: "c1", receivedDateTime: "2026-10-01T10:00:00Z", from: { emailAddress: { address: "jane@acme.com" } } },
    { id: "b", conversationId: "c2", receivedDateTime: "2026-10-01T10:00:00Z", from: { emailAddress: { address: "tom@acme.com" } } },
    { id: "c", conversationId: "c3", receivedDateTime: "2026-10-01T10:00:00Z", from: { emailAddress: { address: "me@co.com" } } },
    { id: "d", conversationId: "c4", receivedDateTime: "2026-10-01T10:00:00Z", from: { emailAddress: { address: "x@acme.com" } }, inferenceClassification: "other" as const },
  ];
  const sent = [{ id: "s", conversationId: "c2", sentDateTime: "2026-10-01T11:00:00Z" }];
  const r = computeNeedsReply(inbox, sent, "me@co.com");
  assert.deepEqual([r.get("a"), r.get("b"), r.get("c"), r.get("d")], [true, false, false, false]);
});

test("Graph UTC times without a zone are read as UTC", () => {
  const e = mapGraphEvent({ id: "e", subject: "Site visit", start: { dateTime: "2026-10-02T15:00:00.0000000" }, end: { dateTime: "2026-10-02T16:00:00.0000000" }, responseStatus: { response: "notResponded" }, attendees: [1, 2] })!;
  assert.equal(e.startsAt.toISOString(), "2026-10-02T15:00:00.000Z");
  assert.equal(e.myResponse, "needsAction");
  assert.equal(mapGraphEvent({ id: "x", isCancelled: true, start: { dateTime: "2026-10-02T15:00:00" }, end: { dateTime: "2026-10-02T16:00:00" } }), null);
});

test("Google events: all-day, my response, cancelled", () => {
  const e = mapGoogleEvent({ id: "g", summary: "Inspection", start: { date: "2026-10-05" }, end: { date: "2026-10-06" }, attendees: [{ email: "me@x.com", self: true, responseStatus: "tentative" }, { email: "b@x.com" }] })!;
  assert.deepEqual([e.allDay, e.myResponse, e.attendees], [true, "tentative", 2]);
  assert.equal(mapGoogleEvent({ id: "c", status: "cancelled", start: {}, end: {} }), null);
});

test("raw email for Gmail send", () => {
  const raw = Buffer.from(buildRawEmail("a@x.com", "b@y.com", "Quote ✓", "Hello"), "base64url").toString();
  assert.match(raw, /^From: a@x.com\r\nTo: b@y.com\r\nSubject: =\?UTF-8\?B\?/);
  assert.ok(raw.endsWith(Buffer.from("Hello").toString("base64")));
});

test("communication signals", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const s = commSignals([{ receivedAt: new Date("2026-10-08T12:00:00Z"), fromName: "Jane", fromEmail: null }, { receivedAt: new Date("2026-10-10T11:00:00Z"), fromName: "Tom", fromEmail: null }], 30, 2, now);
  assert.equal(s[0].title, "1 email waiting over a day for a reply");
  assert.equal(s.length, 3);
});
