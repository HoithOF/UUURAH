"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    MergeLink?: { initialize: (o: { linkToken: string; onSuccess: (publicToken: string) => void; onReady?: () => void; onExit?: () => void }) => void; openLink: () => void };
  }
}

function loadScript(): Promise<void> {
  if (window.MergeLink) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.merge.dev/initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load the payroll connector"));
    document.head.appendChild(s);
  });
}

export function MergeConnect({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/merge/link-token", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't start the connection");
      await loadScript();
      window.MergeLink!.initialize({
        linkToken: json.linkToken,
        onReady: () => window.MergeLink!.openLink(),
        onExit: () => setBusy(false),
        onSuccess: async (publicToken) => {
          const r = await fetch("/api/merge/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken }) });
          setBusy(false);
          if (!r.ok) return setError("Connected, but saving it failed. Try again.");
          router.push("/dashboard/connections?connected=1");
          router.refresh();
        },
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button className="btn primary" onClick={start} disabled={busy}>{busy ? "Opening..." : label}</button>
      {error && <div className="error small">{error}</div>}
    </div>
  );
}
