import "server-only";
import { db } from "./db";
import { businessHealth } from "./health";
import { sendEmail, simpleHtml } from "./email";
import { alertDue, alertEmail, shouldSend, type Frequency } from "./alerts-core";
import { appUrl } from "./url";

/** Sends every alert email that is due now. Safe to run every hour. */
export async function sendDueAlerts(now = new Date()) {
  const members = await db.membership.findMany({
    where: { alertFrequency: { not: "off" }, user: { emailVerifiedAt: { not: null } } },
    include: { user: true, workspace: true },
  });
  const health = new Map<string, Awaited<ReturnType<typeof businessHealth>>>();
  const results: { email: string; company: string; sent: boolean; reason?: string }[] = [];

  for (const m of members) {
    const freq = m.alertFrequency as Frequency;
    if (!alertDue(freq, m.alertLastSentAt, now, m.user.timeZone)) continue;
    if (!health.has(m.workspaceId)) health.set(m.workspaceId, await businessHealth(m.workspaceId));
    const h = health.get(m.workspaceId)!;
    if (h.connections.length === 0) {
      results.push({ email: m.user.email, company: m.workspace.name, sent: false, reason: "nothing connected" });
      continue;
    }
    // Mark first so a crash mid-send can't cause a second email on the next run.
    await db.membership.update({ where: { id: m.id }, data: { alertLastSentAt: now } });
    if (!shouldSend(freq, h.problems)) {
      results.push({ email: m.user.email, company: m.workspace.name, sent: false, reason: "all clear" });
      continue;
    }
    const e = alertEmail(m.workspace.name, freq, h.problems, h.areas, appUrl("/dashboard"), appUrl("/dashboard/settings#alerts"));
    try {
      await sendEmail({
        to: m.user.email,
        subject: e.subject,
        text: e.text,
        html: simpleHtml(
          e.subject,
          [
            e.intro,
            ...e.top.map((s, i) => `${i + 1}. ${s.title}. ${s.detail}`),
            ...(e.more ? [`...and ${e.more} more on the dashboard.`] : []),
            ...(e.areaLines.length ? ["By area:", ...e.areaLines] : []),
            "You can change or stop these emails in Settings.",
          ],
          { label: "Open your dashboard", url: appUrl("/dashboard") },
        ),
      });
      results.push({ email: m.user.email, company: m.workspace.name, sent: true });
    } catch (err) {
      console.error("alert email failed", m.user.email, err);
      results.push({ email: m.user.email, company: m.workspace.name, sent: false, reason: "send failed" });
    }
  }
  return results;
}
