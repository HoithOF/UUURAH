import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { sendDueAlerts } from "@/lib/alerts";

// Called hourly by netlify/functions/scheduled.mts. Send: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await sendDueAlerts();
  return NextResponse.json({ sent: results.filter((r) => r.sent).length, checked: results.length });
}
