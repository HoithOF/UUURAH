import Link from "next/link";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";
import { assistantConfigured } from "@/lib/assistant";
import { fmtDate } from "@/lib/dates";
import { AssistantChat, type Turn } from "@/components/AssistantChat";

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { user, workspace } = await requireWorkspace();
  const { chat: chatId } = await searchParams;
  const ready = assistantConfigured();
  const [chats, current] = await Promise.all([
    db.assistantChat.findMany({ where: { workspaceId: workspace.id, userId: user.id }, orderBy: { updatedAt: "desc" }, take: 15 }),
    chatId ? db.assistantChat.findFirst({ where: { id: chatId, workspaceId: workspace.id, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } }) : null,
  ]);
  const turns: Turn[] = current?.messages.map((m) => ({ role: m.role as Turn["role"], content: m.content })) ?? [];
  return (
    <>
      <h1>Ask your business</h1>
      <p className="muted">Answers come from the apps you&apos;ve connected, using the same numbers as your dashboard. It can read, but it can&apos;t send, change or pay anything.</p>
      {!ready && <div className="signal warning"><span className="dot" /><div><div className="title">Not set up yet</div><div className="small">Whoever runs this site needs to add an ANTHROPIC_API_KEY.</div></div></div>}
      <div className="ask-layout">
        <AssistantChat key={current?.id ?? "new"} ready={ready} chatId={current?.id} initialTurns={turns} />
        {chats.length > 0 && (
          <aside className="chatlist">
            <Link className="btn" href="/dashboard/assistant">New question</Link>
            <div className="small muted" style={{ margin: "12px 0 4px" }}>Earlier</div>
            {chats.map((c) => (
              <Link key={c.id} href={`/dashboard/assistant?chat=${c.id}`} className={`chatlink ${c.id === current?.id ? "on" : ""}`}>
                <span>{c.title}</span>
                <span className="small muted">{fmtDate(c.updatedAt, user.timeZone)}</span>
              </Link>
            ))}
          </aside>
        )}
      </div>
    </>
  );
}
