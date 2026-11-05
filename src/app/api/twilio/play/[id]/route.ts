import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { requireWorkspace } from "@/lib/workspace";

// Streams a voicemail through us, so recordings never need to be public on Twilio.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { workspace } = await requireWorkspace();
  const { id } = await params;
  const call = await db.callLog.findFirst({ where: { id, workspaceId: workspace.id } });
  const line = await db.phoneLine.findUnique({ where: { workspaceId: workspace.id } });
  if (!call?.recordingUrl || !line) return new Response("not found", { status: 404 });
  const url = new URL(call.recordingUrl + ".mp3");
  if (!/(^|\.)twilio\.com$/.test(url.hostname) && !process.env.TWILIO_API_URL) return new Response("not found", { status: 404 });
  const res = await fetch(url, { headers: { authorization: "Basic " + Buffer.from(`${line.subaccountSid}:${decrypt(line.authTokenEnc)}`).toString("base64") } });
  if (!res.ok || !res.body) return new Response("not available", { status: 502 });
  return new Response(res.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
}
