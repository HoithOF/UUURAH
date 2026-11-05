"use client";

import { useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; content: string; notice?: string };

const TOOL_LABELS: Record<string, string> = {
  business_health: "Checking every area",
  money_summary: "Reading your money",
  search_transactions: "Searching transactions",
  spending_by_category: "Adding up spending",
  marketing_summary: "Reading your ads",
  communication_summary: "Reading mail and calendar",
  sales_pipeline: "Reading your pipeline",
  people_summary: "Reading payroll",
};

const STARTERS = [
  "Where is my business struggling right now?",
  "Why did profit change compared with last month?",
  "Which ad campaign should I cut?",
  "Who do I need to get back to today?",
];

export function AssistantChat({ ready }: { ready: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns.filter((t) => t.content), { role: "user", content: q }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setStatus("Thinking");
    const update = (fn: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20).map(({ role, content }) => ({ role, content })) }),
        signal: abort.current.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Something went wrong." }));
        update((t) => ({ ...t, notice: err.error }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const e = JSON.parse(line);
          if (e.type === "text") { setStatus(null); update((t) => ({ ...t, content: t.content + e.text })); }
          else if (e.type === "tool") setStatus(TOOL_LABELS[e.name] ?? "Looking things up");
          else if (e.type === "notice" || e.type === "error") update((t) => ({ ...t, notice: e.text }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") update((t) => ({ ...t, notice: "Lost the connection. Try again." }));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="chat">
      {turns.length === 0 && (
        <div className="starters">
          {STARTERS.map((s) => (
            <button key={s} className="btn" disabled={!ready} onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="turns" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            {t.content && <div className="bubble">{t.content}</div>}
            {t.role === "assistant" && busy && i === turns.length - 1 && status && <div className="small muted">{status}...</div>}
            {t.notice && <div className="error small">{t.notice}</div>}
          </div>
        ))}
      </div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          placeholder={ready ? "Ask anything about your business" : "The assistant isn't set up yet"}
          rows={2}
          disabled={!ready}
          aria-label="Your question"
        />
        {busy ? (
          <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button>
        ) : (
          <button className="btn primary" disabled={!ready || !input.trim()}>Ask</button>
        )}
      </form>
    </div>
  );
}
