import { formatMoney, pctChange } from "@/lib/metrics-core";

// `goodWhenUp` flips the colour for numbers where a rise is bad (refunds, spending).
export function Stat({ label, cents, prevCents, currency, goodWhenUp = true }: { label: string; cents: number; prevCents?: number; currency: string; goodWhenUp?: boolean }) {
  const change = prevCents === undefined ? null : pctChange(Math.abs(cents), Math.abs(prevCents));
  const good = change !== null && (change >= 0) === goodWhenUp;
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{formatMoney(cents, currency)}</div>
      {change !== null && <div className={`delta ${good ? "up" : "down"}`}>{change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}% vs. prior 30 days</div>}
    </div>
  );
}
