import Link from "next/link";
import type { AreaStatus } from "@/lib/metrics-core";

const LABEL: Record<string, string> = { money: "Money", marketing: "Marketing", communication: "Communication", sales: "Sales", people: "People" };
const STATUS: Record<AreaStatus, string> = { critical: "Needs attention now", warning: "Worth a look", good: "Healthy", "not-connected": "Not connected" };

export function HealthGrid({ areas }: { areas: { area: string; status: AreaStatus; issues: number; headline: string }[] }) {
  return (
    <div className="grid health">
      {areas.map((a) => (
        <Link key={a.area} href={a.status === "not-connected" ? "/dashboard/connections" : `/dashboard/${a.area}`} className={`card area ${a.status}`}>
          <div className="area-top"><span className="dot" aria-hidden />{LABEL[a.area]}</div>
          <div className="area-status">{STATUS[a.status]}{a.issues > 1 ? ` · ${a.issues} issues` : ""}</div>
          <div className="small">{a.headline}</div>
        </Link>
      ))}
    </div>
  );
}
