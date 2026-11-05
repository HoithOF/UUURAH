import { db } from "@/lib/db";
import { twilioWebhook } from "@/lib/twilio";
import { twiml } from "@/lib/twilio-core";

// Voicemail finished (Record action) or its file is ready (recording status callback).
export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params } = hook;
  if (params.RecordingUrl)
    await db.callLog.updateMany({
      where: { sid: params.CallSid },
      data: { status: "voicemail", recordingUrl: params.RecordingUrl, ...(params.RecordingDuration ? { durationSec: Number(params.RecordingDuration) } : {}) },
    });
  return new Response(twiml.hangup(), { headers: { "content-type": "text/xml" } });
}
