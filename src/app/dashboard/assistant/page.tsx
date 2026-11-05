import { requireWorkspace } from "@/lib/workspace";
import { assistantConfigured } from "@/lib/assistant";
import { AssistantChat } from "@/components/AssistantChat";

export default async function AssistantPage() {
  await requireWorkspace();
  const ready = assistantConfigured();
  return (
    <>
      <h1>Ask your business</h1>
      <p className="muted">Answers come from the apps you&apos;ve connected, using the same numbers as your dashboard. It can read, but it can&apos;t send, change or pay anything.</p>
      {!ready && <div className="signal warning"><span className="dot" /><div><div className="title">Not set up yet</div><div className="small">Whoever runs this site needs to add an ANTHROPIC_API_KEY.</div></div></div>}
      <AssistantChat ready={ready} />
    </>
  );
}
