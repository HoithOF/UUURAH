import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, totpCode, verifyTotp, newRecoveryCodes } from "../src/lib/totp.ts";

// RFC 6238 appendix B test secret ("12345678901234567890"), 8-digit vectors truncated to 6.
const SECRET = base32Encode(Buffer.from("12345678901234567890"));

test("base32 round trip", () => {
  const b = Buffer.from([0, 1, 2, 250, 255, 7, 9]);
  assert.deepEqual(base32Decode(base32Encode(b)), b);
  assert.equal(SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

test("matches RFC 6238 SHA-1 vectors", () => {
  assert.equal(totpCode(SECRET, 59_000, 30, 8), "94287082");
  assert.equal(totpCode(SECRET, 1111111109_000, 30, 8), "07081804");
  assert.equal(totpCode(SECRET, 20000000000_000, 30, 8), "65353130");
});

test("verify allows one step of drift and rejects junk", () => {
  const now = 1_800_000_000_000;
  assert.ok(verifyTotp(SECRET, totpCode(SECRET, now), now));
  assert.ok(verifyTotp(SECRET, totpCode(SECRET, now - 30_000), now));
  assert.ok(!verifyTotp(SECRET, totpCode(SECRET, now - 90_000), now));
  assert.ok(!verifyTotp(SECRET, "abc123", now));
});

test("recovery codes look like xxxxx-xxxxx and are unique", () => {
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) assert.match(c, /^[a-z2-7]{5}-[a-z2-7]{5}$/);
});
