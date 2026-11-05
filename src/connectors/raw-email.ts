// RFC 2822 message, base64url-encoded, as Gmail's send endpoint expects.
export function buildRawEmail(from: string, to: string, subject: string, text: string) {
  const enc = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
  const msg = [`From: ${from}`, `To: ${to}`, `Subject: ${enc(subject)}`, "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", Buffer.from(text).toString("base64")].join("\r\n");
  return Buffer.from(msg).toString("base64url");
}
