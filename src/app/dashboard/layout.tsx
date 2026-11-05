import { NavLink } from "@/components/NavLink";
import { requireWorkspace } from "@/lib/workspace";
import { logout } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireWorkspace();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">UUURAH</div>
        <div className="ws">{workspace.name}</div>
        <NavLink href="/dashboard">Overview</NavLink>
        <div className="navlabel">Your business</div>
        <NavLink href="/dashboard/money">Money</NavLink>
        <NavLink href="/dashboard/marketing">Marketing</NavLink>
        <NavLink href="/dashboard/communication">Communication</NavLink>
        <NavLink href="/dashboard/sales" soon="wave 4">Sales</NavLink>
        <NavLink href="/dashboard/people" soon="wave 4">People</NavLink>
        <div className="navlabel">Setup</div>
        <NavLink href="/dashboard/connections">Connections</NavLink>
        <NavLink href="/dashboard/settings">Settings</NavLink>
        <div className="spacer" />
        <form action={logout}>
          <button className="navlink btn" style={{ border: 0, background: "none", width: "100%" }}>Log out {user.name.split(" ")[0]}</button>
        </form>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
