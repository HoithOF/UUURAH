import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { assistantConfigured, runAssistant } from "@/lib/assistant";
import { workspaceAccess } from "@/lib/billing";
import { allow } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ chatId: z.string().max(40).optional(), message: z.string().trim().min(1).max(8000) });

export async function POST(req: Request) {
  const { user, workspace } = await requireWorkspace();
  if (!workspaceAccess(workspace).ok) return NextResponse.json({ error: "Subscribe on the Billing page to keep using the assistant." }, { status: 402 });
  if (!assistantConfigured()) return NextResponse.json({ error: "The assistant isn't set up yet. Add ANTHROPIC_API_KEY to the server's settings." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!(await allow(`assistant:${user.id}`, 60, 3600_000))) return NextResponse.json({ error: "That's a lot of questions this hour. Try again a bit later." }, { status: 429 });

  // History comes from the database, never the browser, so a chat can only continue itself.
  const chat = parsed.data.chatId
    ? await db.assistantChat.findFirst({ where: { id: parsed.data.chatId, workspaceId: workspace.id, userId: user.id } })
    : await db.assistantChat.create({ data: { workspaceId: workspace.id, userId: user.id, title: parsed.data.message.slice(0, 80) } });
  if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const earlier = await db.assistantMessage.findMany({ where: { chatId: chat.id }, orderBy: { createdAt: "desc" }, take: 20 });
  await db.assistantMessage.create({ data: { chatId: chat.id, role: "user", content: parsed.data.message } });
  const history = [...earlier.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })), { role: "user" as const, content: parsed.data.message }];

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      let answer = "";
      send({ type: "chat", id: chat.id });
      try {
        await runAssistant({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          history,
          emit: (e) => {
            if (e.type === "text") answer += e.text;
            send(e);
          },
          signal: req.signal,
        });
      } catch (e) {
        console.error("assistant failed", e);
        send({ type: "error", text: "Something went wrong reaching the assistant. Try again in a minute." });
      }
      // Always store a reply so the conversation keeps alternating user / assistant.
      await db.assistantMessage.create({ data: { chatId: chat.id, role: "assistant", content: answer.trim() || "(no answer)" } });
      await db.assistantChat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
      send({ type: "done" });
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
