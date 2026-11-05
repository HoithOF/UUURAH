import { db } from "@/lib/db";
import { twilioWebhook } from "@/lib/twilio";

// Call progress. For browser calls the dialed leg reports here with ParentCallSid = the call we logged.
export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params } = hook;
  const sid = params.ParentCallSid || params.CallSid;
  await db.callLog.updateMany({
    where: { sid, status: { not: "voicemail" } },
    data: { status: params.CallStatus ?? "completed", ...(params.CallDuration ? { durationSec: Number(params.CallDuration) } : {}) },
  });
  return new Response(null, { status: 204 });
}
