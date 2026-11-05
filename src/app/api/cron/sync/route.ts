import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { syncStale } from "@/lib/sync";

// Called on a schedule (Netlify scheduled function, cron-job.org, etc.) to refresh
// apps that don't push updates. Send: Authorization: Bearer <CRON_SECRET>.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncStale(30);
  return NextResponse.json({ synced: results.length, results });
}
