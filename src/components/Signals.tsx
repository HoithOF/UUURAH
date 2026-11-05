import type { Signal } from "@/lib/metrics-core";

export function Signals({ signals }: { signals: Signal[] }) {
  return (
    <div>
      {signals.map((s, i) => (
        <div key={i} className={`signal ${s.severity}`}>
          <span className="dot" aria-hidden />
          <div>
            <div className="title">{s.title}</div>
            <div className="small">{s.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
