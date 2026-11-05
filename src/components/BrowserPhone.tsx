"use client";

import { useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";

type State = "starting" | "ready" | "calling" | "in-call" | "incoming" | "error";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

async function fetchToken() {
  const r = await fetch("/api/twilio/token", { cache: "no-store" });
  if (!r.ok) throw new Error("Couldn't start the phone.");
  return (await r.json()).token as string;
}

export function BrowserPhone({ initialNumber = "" }: { initialNumber?: string }) {
  const device = useRef<Device | null>(null);
  const call = useRef<Call | null>(null);
  const [state, setState] = useState<State>("starting");
  const [number, setNumber] = useState(initialNumber);
  const [caller, setCaller] = useState("");
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { Device } = await import("@twilio/voice-sdk");
        const d = new Device(await fetchToken(), { closeProtection: true });
        d.on("tokenWillExpire", async () => d.updateToken(await fetchToken()));
        d.on("error", (e: { message?: string }) => {
          setErr(e.message ?? "Phone error");
          setState((s) => (s === "starting" ? "error" : s));
        });
        d.on("incoming", (c: Call) => {
          call.current = c;
          setCaller(c.parameters.From ?? "Unknown caller");
          setState("incoming");
          const end = () => { call.current = null; setState("ready"); };
          c.on("disconnect", end); c.on("cancel", end); c.on("reject", end);
        });
        await d.register();
        if (dead) return d.destroy();
        device.current = d;
        setState("ready");
      } catch (e) {
        setErr((e as Error).message);
        setState("error");
      }
    })();
    return () => { dead = true; device.current?.destroy(); };
  }, []);

  async function dial() {
    if (!device.current || !number.trim()) return;
    setErr(null);
    setState("calling");
    const c = await device.current.connect({ params: { To: number } });
    call.current = c;
    c.on("accept", () => setState("in-call"));
    const end = () => { call.current = null; setMuted(false); setState("ready"); };
    c.on("disconnect", end); c.on("cancel", end); c.on("error", (e: { message?: string }) => { setErr(e.message ?? "Call failed"); end(); });
  }

  const press = (k: string) => (state === "in-call" ? call.current?.sendDigits(k) : setNumber((n) => n + k));

  return (
    <div className="card phone">
      <div className="small muted">{state === "starting" ? "Starting phone..." : state === "error" ? "Phone unavailable" : state === "incoming" ? "Incoming call" : state === "in-call" ? "On a call" : state === "calling" ? "Calling..." : "Ready to call"}</div>
      {state === "incoming" ? (
        <>
          <div className="dialnum">{caller}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={() => { call.current?.accept(); setState("in-call"); }}>Answer</button>
            <button className="btn" onClick={() => call.current?.reject()}>Decline</button>
          </div>
        </>
      ) : (
        <>
          <input className="dialnum" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="(512) 555-0134" aria-label="Number to call" inputMode="tel" />
          <div className="keypad">
            {KEYS.map((k) => <button key={k} type="button" className="btn" onClick={() => press(k)}>{k}</button>)}
          </div>
          {state === "in-call" || state === "calling" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn end" onClick={() => call.current?.disconnect()}>Hang up</button>
              <button className="btn" onClick={() => { const m = !muted; call.current?.mute(m); setMuted(m); }}>{muted ? "Unmute" : "Mute"}</button>
            </div>
          ) : (
            <button className="btn primary" disabled={state !== "ready" || !number.trim()} onClick={dial}>Call</button>
          )}
        </>
      )}
      {err && <div className="error small">{err}</div>}
      <p className="small muted" style={{ marginTop: 8 }}>Keep this page open to take calls. Calls nobody answers in 20 seconds go to voicemail.</p>
    </div>
  );
}
