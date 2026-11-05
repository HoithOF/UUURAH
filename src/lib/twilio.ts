import "server-only";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import { appUrl } from "./url";
import { toE164, validTwilioSignature, voiceToken } from "./twilio-core";

const API = () => process.env.TWILIO_API_URL ?? "https://api.twilio.com";

export function phoneConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

async function api<T>(sid: string, secret: string, method: "GET" | "POST", path: string, params: Record<string, string> = {}, user = sid): Promise<T> {
  const url = new URL(`/2010-04-01/Accounts/${sid}${path}`, API());
  const init: RequestInit = { method, headers: { authorization: "Basic " + Buffer.from(`${user}:${secret}`).toString("base64") } };
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else {
    init.body = new URLSearchParams(params);
    (init.headers as Record<string, string>)["content-type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${json.message ?? res.status}`);
  return json as T;
}

const platform = () => ({ sid: process.env.TWILIO_ACCOUNT_SID!, token: process.env.TWILIO_AUTH_TOKEN! });
const sub = (line: { subaccountSid: string; authTokenEnc: string }) => ({ sid: line.subaccountSid, token: decrypt(line.authTokenEnc) });

/** Each company gets its own Twilio subaccount, so numbers, logs and usage are kept apart. */
async function ensureLine(workspaceId: string, company: string) {
  const existing = await db.phoneLine.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  const acct = await createSubaccount(platform(), company);
  return db.phoneLine.create({ data: { workspaceId, subaccountSid: acct.sid, authTokenEnc: encrypt(acct.auth_token) } });
}

async function createSubaccount(p: { sid: string; token: string }, company: string) {
  const res = await fetch(new URL("/2010-04-01/Accounts.json", API()), {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${p.sid}:${p.token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ FriendlyName: `UUURAH: ${company}`.slice(0, 64) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Twilio: ${json.message ?? res.status}`);
  return json as { sid: string; auth_token: string };
}

export type AvailableNumber = { phone_number: string; friendly_name: string; locality: string | null; region: string | null };

export async function searchNumbers(workspaceId: string, company: string, areaCode: string) {
  const line = await ensureLine(workspaceId, company);
  const s = sub(line);
  const r = await api<{ available_phone_numbers: AvailableNumber[] }>(s.sid, s.token, "GET", "/AvailablePhoneNumbers/US/Local.json", {
    AreaCode: areaCode,
    SmsEnabled: "true",
    VoiceEnabled: "true",
    PageSize: "12",
  });
  return r.available_phone_numbers;
}

export async function buyNumber(workspaceId: string, company: string, phoneNumber: string) {
  const line = await ensureLine(workspaceId, company);
  if (line.number) throw new Error("This company already has a number.");
  const s = sub(line);
  let { apiKeySid, apiKeySecretEnc, appSid } = line;
  if (!apiKeySid) {
    const key = await api<{ sid: string; secret: string }>(s.sid, s.token, "POST", "/Keys.json", { FriendlyName: "browser phone" });
    apiKeySid = key.sid;
    apiKeySecretEnc = encrypt(key.secret);
  }
  if (!appSid) {
    const app = await api<{ sid: string }>(s.sid, s.token, "POST", "/Applications.json", { FriendlyName: "browser phone", VoiceUrl: appUrl("/api/twilio/voice"), VoiceMethod: "POST" });
    appSid = app.sid;
  }
  const num = await api<{ sid: string; phone_number: string }>(s.sid, s.token, "POST", "/IncomingPhoneNumbers.json", {
    PhoneNumber: phoneNumber,
    VoiceUrl: appUrl("/api/twilio/voice"),
    VoiceMethod: "POST",
    StatusCallback: appUrl("/api/twilio/status"),
    SmsUrl: appUrl("/api/twilio/sms"),
    SmsMethod: "POST",
  });
  return db.phoneLine.update({ where: { id: line.id }, data: { apiKeySid, apiKeySecretEnc, appSid, number: num.phone_number, numberSid: num.sid } });
}

export async function sendText(workspaceId: string, userId: string, to: string, body: string) {
  const line = await db.phoneLine.findUnique({ where: { workspaceId } });
  if (!line?.number) throw new Error("Get a phone number first.");
  const dest = toE164(to);
  if (!dest) throw new Error("That doesn't look like a phone number.");
  const s = sub(line);
  const msg = await api<{ sid: string; status: string }>(s.sid, s.token, "POST", "/Messages.json", {
    To: dest,
    From: line.number,
    Body: body,
    StatusCallback: appUrl("/api/twilio/sms-status"),
  });
  await db.textMessage.create({ data: { workspaceId, sid: msg.sid, direction: "outbound", other: dest, body, status: msg.status, sentById: userId, readAt: new Date() } });
  // Replying counts as reading the conversation.
  await db.textMessage.updateMany({ where: { workspaceId, other: dest, direction: "inbound", readAt: null }, data: { readAt: new Date() } });
}

export const identityFor = (workspaceId: string, userId: string) => `ws_${workspaceId}_u_${userId}`;

export async function browserPhoneToken(workspaceId: string, userId: string) {
  const line = await db.phoneLine.findUnique({ where: { workspaceId } });
  if (!line?.number || !line.apiKeySid || !line.apiKeySecretEnc || !line.appSid) return null;
  return voiceToken({ accountSid: line.subaccountSid, apiKeySid: line.apiKeySid, apiKeySecret: decrypt(line.apiKeySecretEnc), identity: identityFor(workspaceId, userId), appSid: line.appSid });
}

/** Closes the subaccount, which releases the number. Used when a company deletes its phone or itself. */
export async function closeLine(workspaceId: string) {
  const line = await db.phoneLine.findUnique({ where: { workspaceId } });
  if (!line) return;
  const p = platform();
  await fetch(new URL(`/2010-04-01/Accounts/${line.subaccountSid}.json`, API()), {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(`${p.sid}:${p.token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ Status: "closed" }),
  }).catch(() => undefined);
  await db.phoneLine.delete({ where: { id: line.id } });
}

/** Parses and authenticates a Twilio webhook. Returns the params and the company's line, or null if the signature is wrong. */
export async function twilioWebhook(req: Request) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const line = await db.phoneLine.findUnique({ where: { subaccountSid: params.AccountSid ?? "" }, include: { workspace: true } });
  if (!line) return null;
  // Twilio signs the public URL it called, which behind a proxy is APP_URL + path, not req.url.
  const u = new URL(req.url);
  const signedUrl = appUrl(u.pathname + u.search);
  if (!validTwilioSignature(decrypt(line.authTokenEnc), signedUrl, params, req.headers.get("x-twilio-signature"))) return null;
  return { params, line };
}
