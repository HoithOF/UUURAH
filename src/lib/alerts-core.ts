import type { Signal } from "./metrics-core";

export type Frequency = "off" | "daily" | "weekly";
export type AreaLite = { area: string; status: string; headline: string };

/** Hour (0-23) and weekday (0 = Sunday) for `now` in a time zone. */
export function localParts(now: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
}

/**
 * Alerts go out at 7am local time or later: daily ones every day, weekly ones on Monday.
 * The gap checks stop double sends when the job runs every hour.
 */
export function alertDue(freq: Frequency, lastSent: Date | null, now: Date, timeZone: string) {
  if (freq === "off") return false;
  const { hour, weekday } = localParts(now, timeZone);
  if (hour < 7) return false;
  const since = lastSent ? now.getTime() - lastSent.getTime() : Infinity;
  if (freq === "daily") return since > 20 * 3600_000;
  return weekday === 1 && since > 6 * 864e5;
}

/** Daily alerts only go out when something is wrong; weekly ones always do, as a check-in. */
export function shouldSend(freq: Frequency, problems: Signal[]) {
  const bad = problems.filter((s) => s.severity !== "good");
  return freq === "weekly" || bad.length > 0;
}

const AREA_NAMES: Record<string, string> = { money: "Money", marketing: "Marketing", communication: "Communication", sales: "Sales", people: "People" };
const MARK: Record<string, string> = { critical: "🔴", warning: "🟡", good: "🟢", "not-connected": "⚪" };

export function alertEmail(company: string, freq: Frequency, problems: Signal[], areas: AreaLite[], dashboardUrl: string, settingsUrl: string) {
  const bad = problems.filter((s) => s.severity !== "good");
  const critical = bad.filter((s) => s.severity === "critical").length;
  const subject = bad.length
    ? `${bad.length} thing${bad.length === 1 ? "" : "s"} need${bad.length === 1 ? "s" : ""} attention at ${company}${critical ? ` (${critical} urgent)` : ""}`
    : `${company} looks healthy this week`;
  const top = bad.slice(0, 5);
  const areaLines = areas.filter((a) => a.status !== "not-connected").map((a) => `${MARK[a.status]} ${AREA_NAMES[a.area] ?? a.area}: ${a.headline}`);
  const intro = bad.length ? "Here's what needs your attention first:" : "Nothing needs your attention right now.";
  const text = [
    `${company}, ${freq === "daily" ? "today" : "this week"}`,
    "",
    intro,
    ...top.map((s, i) => `${i + 1}. ${s.title}. ${s.detail}`),
    ...(bad.length > top.length ? [`...and ${bad.length - top.length} more on the dashboard.`] : []),
    "",
    ...(areaLines.length ? ["By area:", ...areaLines, ""] : []),
    `Open your dashboard: ${dashboardUrl}`,
    "",
    `Change or stop these emails: ${settingsUrl}`,
  ].join("\n");
  return { subject, text, top, areaLines, intro, more: Math.max(0, bad.length - top.length) };
}
