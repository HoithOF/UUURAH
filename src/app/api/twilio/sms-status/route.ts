import { db } from "@/lib/db";
import { twilioWebhook } from "@/lib/twilio";

export async function POST(req: Request) {
  const hook = await twilioWebhook(req);
  if (!hook) return new Response("forbidden", { status: 403 });
  const { params } = hook;
  if (params.MessageSid && params.MessageStatus) await db.textMessage.updateMany({ where: { sid: params.MessageSid, workspaceId: hook.line.workspaceId }, data: { status: params.MessageStatus } });
  return new Response(null, { status: 204 });
}
