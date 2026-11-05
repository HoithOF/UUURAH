// Daily money in vs. money out for the last 30 days, as inline SVG (no chart library).
export function MoneyChart({ daily }: { daily: { day: string; sales: number; out: number }[] }) {
  const W = 720, H = 200, padL = 8, padB = 22, padT = 8;
  const max = Math.max(1, ...daily.map((d) => Math.max(d.sales, d.out)));
  const slot = (W - padL) / daily.length;
  const bw = Math.max(2, slot / 2 - 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily money in and money out, last 30 days">
      <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="var(--border)" />
      {daily.map((d, i) => {
        const x = padL + i * slot;
        return (
          <g key={d.day}>
            <title>{`${d.day}: in ${(d.sales / 100).toFixed(2)}, out ${(d.out / 100).toFixed(2)}`}</title>
            <rect x={x + 1} y={y(d.sales)} width={bw} height={H - padB - y(d.sales)} rx="2" fill="var(--good)" />
            <rect x={x + 1 + bw + 1} y={y(d.out)} width={bw} height={H - padB - y(d.out)} rx="2" fill="var(--bad)" opacity="0.75" />
            {i % 7 === 0 && <text x={x + 1} y={H - 6} fontSize="11" fill="var(--muted)">{d.day.slice(5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}
