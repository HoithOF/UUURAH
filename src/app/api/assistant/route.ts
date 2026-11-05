import { NextResponse } from "next/server";
import * as z from "zod/v4";
import { requireWorkspace } from "@/lib/workspace";
import { assistantConfigured, runAssistant } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user"),
});

export async function POST(req: Request) {
  const { workspace } = await requireWorkspace();
  if (!assistantConfigured()) return NextResponse.json({ error: "The assistant isn't set up yet. Add ANTHROPIC_API_KEY to the server's settings." }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: object) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runAssistant({ workspaceId: workspace.id, workspaceName: workspace.name, history: parsed.data.messages, emit: send, signal: req.signal });
      } catch (e) {
        console.error("assistant failed", e);
        send({ type: "error", text: "Something went wrong reaching the assistant. Try again in a minute." });
      }
      send({ type: "done" });
      controller.close();
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
