import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { prettyPhone, toE164, twilioSignature, twiml, validTwilioSignature, voiceToken } from "../src/lib/twilio-core.ts";

test("signature matches Twilio's documented example", () => {
  // Expected value computed with the official twilio npm library (getExpectedTwilioSignature).
  const token = "12345";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
  assert.equal(twilioSignature(token, url, params), "0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
  assert.ok(validTwilioSignature(token, url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ="));
  assert.ok(!validTwilioSignature(token, url, { ...params, Digits: "9" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ="));
  assert.ok(!validTwilioSignature(token, url, params, null));
});

test("voice token is a valid HS256 JWT with the voice grant", () => {
  const t = voiceToken({ accountSid: "AC1", apiKeySid: "SK1", apiKeySecret: "secret", identity: "ws_a_u_b", appSid: "AP1", now: 1_800_000_000_000 });
  const [h, p, sig] = t.split(".");
  assert.equal(createHmac("sha256", "secret").update(`${h}.${p}`).digest("base64url"), sig);
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.equal(payload.iss, "SK1");
  assert.equal(payload.sub, "AC1");
  assert.equal(payload.exp - payload.iat, 3600);
  assert.deepEqual(payload.grants.voice.outgoing, { application_sid: "AP1" });
  assert.equal(JSON.parse(Buffer.from(h, "base64url").toString()).cty, "twilio-fpa;v=1");
});

test("phone number normalization", () => {
  assert.equal(toE164("(512) 555-0134"), "+15125550134");
  assert.equal(toE164("1-512-555-0134"), "+15125550134");
  assert.equal(toE164("+44 20 7946 0958"), "+442079460958");
  assert.equal(toE164("555-0134"), null);
  assert.equal(prettyPhone("+15125550134"), "(512) 555-0134");
});

test("TwiML escapes input", () => {
  assert.match(twiml.dialNumber("+15125550134", "+15125550000", "https://x/s?a=1&b=2"), /a=1&amp;b=2/);
  assert.match(twiml.voicemail("Tom & Jerry's", "https://x/r"), /Tom &amp; Jerry&apos;s/);
});
