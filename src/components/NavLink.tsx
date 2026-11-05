"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, soon }: { href: string; children: React.ReactNode; soon?: string }) {
  const path = usePathname();
  const active = href === "/dashboard" ? path === href : path.startsWith(href);
  return (
    <Link href={href} className={`navlink${active ? " active" : ""}`}>
      {children}
      {soon && <span className="soon">{soon}</span>}
    </Link>
  );
}
