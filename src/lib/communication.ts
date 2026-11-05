import "server-only";
import { db } from "./db";
import { commSignals } from "./metrics-core";

export async function commSnapshot(workspaceId: string, now = new Date()) {
  const week = new Date(now.getTime() + 7 * 864e5);
  const [waiting, events, connections] = await Promise.all([
    db.message.findMany({ where: { workspaceId, needsReply: true }, orderBy: { receivedAt: "asc" }, take: 50 }),
    db.calendarEvent.findMany({ where: { workspaceId, endsAt: { gte: now }, startsAt: { lt: week } }, orderBy: { startsAt: "asc" } }),
    db.connection.count({ where: { workspaceId, provider: { in: ["outlook", "google-calendar"] }, status: { not: "disconnected" } } }),
  ]);
  const timed = events.filter((e) => !e.allDay && e.myResponse !== "declined");
  const meetingHours = timed.filter((e) => e.attendees > 1).reduce((s, e) => s + (e.endsAt.getTime() - e.startsAt.getTime()) / 3600_000, 0);
  const pending = events.filter((e) => e.myResponse === "needsAction");
  return { connected: connections > 0, waiting, events, pending, meetingHours, signals: commSignals(waiting, meetingHours, pending.length, now) };
}
