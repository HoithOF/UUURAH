"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PlaidHandler = { open: () => void };
declare global {
  interface Window {
    Plaid?: { create: (o: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name?: string } }) => void; onExit: () => void }) => PlaidHandler };
  }
}

const SCRIPT = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadScript(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Couldn't load Plaid"));
    document.head.appendChild(s);
  });
}

export function PlaidConnect() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const router = useRouter();

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/plaid/link-token", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't start bank sign-in");
      await loadScript();
      window.Plaid!.create({
        token: json.linkToken,
        onSuccess: async (publicToken, meta) => {
          const r = await fetch("/api/plaid/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicToken, institution: meta.institution?.name }) });
          setBusy(false);
          if (!r.ok) return setError("The bank connected, but saving it failed. Try again.");
          router.push("/dashboard/connections?connected=1");
          router.refresh();
        },
        onExit: () => setBusy(false),
      }).open();
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div style={{ textAlign: "right" }}>
      <button className="btn primary" onClick={start} disabled={busy}>{busy ? "Opening..." : "Connect a bank"}</button>
      {error && <div className="error small">{error}</div>}
    </div>
  );
}
