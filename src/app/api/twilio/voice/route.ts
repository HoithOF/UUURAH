import { db } from "@/lib/db";
import { twilioWebhook, identityFor } from "@/lib/twilio";
import { toE164, twiml } from "@/lib/twilio-core";
import { appUrl } from "@/lib/url";

const xml = (body: string) => new Response(body, { headers: { "content-type": "text/xml" } });

// Twilio calls this for every call: outbound from the browser phone, and inbound to the company's number.
export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params, line } = hook;
  if (!line.number) return xml(twiml.hangup());

  if (params.From?.startsWith("client:")) {
    // Only people in this company can place calls from its number.
    if (!params.From.startsWith(`client:ws_${line.workspaceId}_u_`)) return xml(twiml.hangup());
    const to = toE164(params.To ?? "");
    if (!to) return xml(twiml.hangup());
    await db.callLog.create({ data: { workspaceId: line.workspaceId, sid: params.CallSid, direction: "outbound", other: to, status: "ringing" } });
    return xml(twiml.dialNumber(to, line.number, appUrl("/api/twilio/status")));
  }

  await db.callLog.upsert({
    where: { sid: params.CallSid },
    create: { workspaceId: line.workspaceId, sid: params.CallSid, direction: "inbound", other: params.From ?? "unknown", status: "ringing" },
    update: {},
  });
  const members = await db.membership.findMany({ where: { workspaceId: line.workspaceId }, select: { userId: true } });
  return xml(twiml.ringClients(members.map((m) => identityFor(line.workspaceId, m.userId)), appUrl("/api/twilio/voice/after")));
}
