import { db } from "@/lib/db";
import { twilioWebhook } from "@/lib/twilio";
import { twiml } from "@/lib/twilio-core";
import { appUrl } from "@/lib/url";

const xml = (body: string) => new Response(body, { headers: { "content-type": "text/xml" } });

// After ringing the team: if nobody answered, take a voicemail.
export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params, line } = hook;
  if (params.DialCallStatus === "completed") {
    await db.callLog.updateMany({ where: { sid: params.CallSid }, data: { status: "completed" } });
    return xml(twiml.hangup());
  }
  await db.callLog.updateMany({ where: { sid: params.CallSid }, data: { status: "no-answer" } });
  return xml(twiml.voicemail(line.workspace.name, appUrl("/api/twilio/recording")));
}
