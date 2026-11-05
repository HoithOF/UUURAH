import Link from "next/link";
import { catalogFor, SECTION_LABELS, type Section } from "@/connectors/catalog";

export function EmptySection({ section, intro, cta }: { section: Section; intro: string; cta: string }) {
  return (
    <>
      <h1>{SECTION_LABELS[section]}</h1>
      <p className="muted">{intro}</p>
      <div className="list" style={{ marginTop: 16 }}>
        {catalogFor(section).map((a) => (
          <div className="app-row" key={a.id}>
            <div><strong>{a.name}</strong><div className="small muted">{a.blurb}</div></div>
            <span className="badge">{a.available ? "Ready to connect" : "Coming later"}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 16 }}><Link className="btn primary" href="/dashboard/connections">{cta}</Link></p>
    </>
  );
}
