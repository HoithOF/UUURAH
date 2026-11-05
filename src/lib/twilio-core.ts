import { createHmac, timingSafeEqual } from "node:crypto";

/** Twilio webhook signature: base64 HMAC-SHA1 of the full URL followed by each POST param name+value, sorted by name. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(data).digest("base64");
}

export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, header: string | null) {
  if (!header) return false;
  const a = Buffer.from(twilioSignature(authToken, url, params));
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Access token for the browser phone (Twilio Voice JS SDK). */
export function voiceToken(o: { accountSid: string; apiKeySid: string; apiKeySecret: string; identity: string; appSid: string; ttlSec?: number; now?: number }) {
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${o.apiKeySid}-${now}`,
    iss: o.apiKeySid,
    sub: o.accountSid,
    iat: now,
    exp: now + (o.ttlSec ?? 3600),
    grants: { identity: o.identity, voice: { incoming: { allow: true }, outgoing: { application_sid: o.appSid } } },
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${body}.${createHmac("sha256", o.apiKeySecret).update(body).digest("base64url")}`;
}

/** Normalizes a phone number to E.164. Bare 10-digit numbers are treated as US/Canada. Returns null if it can't. */
export function toE164(input: string) {
  const s = input.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function prettyPhone(e164: string) {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const x = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export const twiml = {
  empty: () => `<?xml version="1.0" encoding="UTF-8"?><Response/>`,
  dialNumber: (to: string, callerId: string, statusUrl: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${x(callerId)}" answerOnBridge="true"><Number statusCallback="${x(statusUrl)}" statusCallbackEvent="completed">${x(to)}</Number></Dial></Response>`,
  ringClients: (identities: string[], afterUrl: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="20" action="${x(afterUrl)}">${identities.slice(0, 10).map((i) => `<Client>${x(i)}</Client>`).join("")}</Dial></Response>`,
  voicemail: (company: string, recordUrl: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>You've reached ${x(company)}. Please leave a message after the tone.</Say><Record maxLength="120" playBeep="true" action="${x(recordUrl)}" recordingStatusCallback="${x(recordUrl)}"/></Response>`,
  hangup: () => `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
};
