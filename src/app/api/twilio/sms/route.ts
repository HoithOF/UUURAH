import { db } from "@/lib/db";
import { twilioWebhook } from "@/lib/twilio";
import { twiml } from "@/lib/twilio-core";

// A customer texted the company's number.
export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params, line } = hook;
  await db.textMessage.upsert({
    where: { sid: params.MessageSid },
    create: { workspaceId: line.workspaceId, sid: params.MessageSid, direction: "inbound", other: params.From, body: (params.Body ?? "").slice(0, 2000), status: "received" },
    update: {},
  });
  return new Response(twiml.empty(), { headers: { "content-type": "text/xml" } });
}
