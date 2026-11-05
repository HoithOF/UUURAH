import { PublicShell } from "./PublicShell";
import { getCurrentUser } from "@/lib/auth";
import { site } from "@/lib/site";

export async function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <PublicShell signedIn={!!user}>
      <article className="legal">
        {process.env.LEGAL_REVIEWED !== "true" && (
          <div className="banner">Draft. Have a lawyer review this page and fill in the bracketed details before launch.</div>
        )}
        <h1>{title}</h1>
        <p className="muted small">Last updated {site.legalUpdated}</p>
        {children}
      </article>
    </PublicShell>
  );
}
