import "server-only";

export type Email = { to: string; subject: string; text: string; html?: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Plain, readable HTML wrapper so emails look the same in every client. */
export function simpleHtml(title: string, paragraphs: string[], button?: { label: string; url: string }) {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f7f7f5;padding:24px;color:#1f1f1e">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e6e6e3;border-radius:12px;padding:24px">
<div style="font-weight:700;margin-bottom:16px">UUURAH</div>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.5;margin:0 0 12px">${esc(p)}</p>`).join("\n")}
${button ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#2f6fde;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${esc(button.label)}</a></p><p style="font-size:12px;color:#6b6b68;overflow-wrap:anywhere">Or paste this link: ${esc(button.url)}</p>` : ""}
</div></body></html>`;
}

/**
 * Sends through Resend (resend.com) when RESEND_API_KEY and EMAIL_FROM are set.
 * Without them, in development (or with EMAIL_TRANSPORT=log) the email is printed to the server log instead.
 */
export async function sendEmail(email: Email) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (process.env.EMAIL_TRANSPORT === "log" || !key || !from) {
    if (process.env.EMAIL_TRANSPORT !== "log" && process.env.NODE_ENV === "production") throw new Error("Email is not set up (RESEND_API_KEY / EMAIL_FROM)");
    console.log(`\n--- email to ${email.to}: ${email.subject}\n${email.text}\n---\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!res.ok) throw new Error(`Email failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
