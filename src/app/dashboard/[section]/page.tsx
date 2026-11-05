import { notFound } from "next/navigation";
import Link from "next/link";
import { catalogFor, SECTION_LABELS, type Section } from "@/connectors/catalog";

const INTRO: Partial<Record<Section, string>> = {
  communication: "Your inbox, calendar and phone in one place, with unanswered customers flagged.",
  sales: "Every deal and every follow-up you owe, from your CRM or from the built-in contact list.",
  people: "Headcount, payroll cost and hours, and labor as a share of revenue.",
};

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in INTRO)) notFound();
  const s = section as Section;
  const apps = catalogFor(s);
  return (
    <>
      <h1>{SECTION_LABELS[s]}</h1>
      <p className="muted">{INTRO[s]}</p>
      <div className="notice">This section arrives in wave {apps[0]?.wave}. Here&apos;s what it will connect to.</div>
      <div className="list">
        {apps.map((a) => (
          <div className="app-row" key={a.id}>
            <div><strong>{a.name}</strong><div className="small muted">{a.blurb}</div></div>
            <span className="badge">Coming soon</span>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 16 }}><Link href="/dashboard/connections">See every connection</Link></p>
    </>
  );
}
