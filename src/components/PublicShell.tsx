import Link from "next/link";
import { site } from "@/lib/site";

export function PublicShell({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  return (
    <div className="public">
      <header className="pub-head">
        <Link href="/" className="brandlink">{site.name}</Link>
        <nav>
          {signedIn ? (
            <Link className="btn primary" href="/dashboard">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link className="btn primary" href="/signup">Get started</Link>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="pub-foot">
        <span>© {new Date().getFullYear()} {site.legalName}</span>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/data-deletion">Delete your data</Link>
        <a href={`mailto:${site.contactEmail}`}>Contact</a>
      </footer>
    </div>
  );
}
