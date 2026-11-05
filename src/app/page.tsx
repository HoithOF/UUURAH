import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PublicShell } from "@/components/PublicShell";
import { CATALOG } from "@/connectors/catalog";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const AREAS = [
  { title: "Money", text: "Sales, spending, profit, unpaid invoices and how many months of cash you have, from Stripe, Square, QuickBooks, Xero, your bank or a spreadsheet." },
  { title: "Marketing", text: "What you spend on Google and Meta ads and how much it actually brings back in sales, campaign by campaign." },
  { title: "Communication", text: "Emails nobody has answered, this week's meetings and invites, with reply and send right from the dashboard." },
  { title: "Sales", text: "Your pipeline, deals that have gone quiet and deals past their close date, from your CRM." },
  { title: "People", text: "Headcount, payroll cost and payroll as a share of sales, from Gusto, ADP, Rippling and more." },
  { title: "Ask", text: "Ask in plain English, like \"why did profit drop?\", and get an answer built from your own numbers." },
];

export default async function Home() {
  const user = await getCurrentUser();
  const live = CATALOG.filter((c) => c.available && c.id !== "csv");
  return (
    <PublicShell signedIn={!!user}>
      <section className="hero">
        <h1>See where your business is struggling, before it hurts.</h1>
        <p className="lede">
          {site.name} connects the apps you already use and puts sales, spending, ads, email, deals and payroll on one screen. Then it tells
          you what needs your attention first.
        </p>
        <div className="cta">
          <Link className="btn primary big" href={user ? "/dashboard" : "/signup"}>{user ? "Open your dashboard" : "Start free"}</Link>
          {!user && <Link className="btn big" href="/login">Log in</Link>}
        </div>
        <p className="small muted">Keep using your own apps. Sign in to each one once, and the numbers stay up to date on their own.</p>
      </section>

      <section className="pub-section">
        <h2>One place for every part of the business</h2>
        <div className="pub-grid">
          {AREAS.map((a) => (
            <div key={a.title} className="card">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{a.title}</div>
              <div className="small">{a.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pub-section">
        <h2>Works with</h2>
        <div className="chips">
          {live.map((c) => <span key={c.id} className="chip">{c.name}</span>)}
          <span className="chip">Excel and CSV</span>
        </div>
      </section>

      <section className="pub-section">
        <h2>Built to keep your data safe</h2>
        <ul className="small">
          <li>You sign in to each app yourself; we never see or store your passwords for them.</li>
          <li>We ask for read-only access wherever the app offers it.</li>
          <li>Every sign-in token is encrypted, and each company&apos;s data is kept separate.</li>
          <li>Two-step login for your team, and you can delete everything at any time.</li>
        </ul>
      </section>
    </PublicShell>
  );
}
