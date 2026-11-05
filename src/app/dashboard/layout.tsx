import { NavLink } from "@/components/NavLink";
import { requireWorkspace } from "@/lib/workspace";
import { logout } from "@/app/auth-actions";
import { switchWorkspace } from "./workspace-actions";
import { VerifyBanner } from "@/components/VerifyBanner";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, memberships } = await requireWorkspace();
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">UUURAH</div>
        {memberships.length > 1 ? (
          <form action={switchWorkspace} className="ws">
            <select name="workspaceId" defaultValue={workspace.id} className="btn" style={{ width: "100%" }} aria-label="Company">
              {memberships.map((m) => <option key={m.workspaceId} value={m.workspaceId}>{m.workspace.name}</option>)}
            </select>
            <button className="btn" style={{ marginTop: 4, width: "100%" }}>Switch</button>
          </form>
        ) : (
          <div className="ws">{workspace.name}</div>
        )}
        <NavLink href="/dashboard">Overview</NavLink>
        <NavLink href="/dashboard/assistant">Ask</NavLink>
        <div className="navlabel">Your business</div>
        <NavLink href="/dashboard/money">Money</NavLink>
        <NavLink href="/dashboard/marketing">Marketing</NavLink>
        <NavLink href="/dashboard/communication">Communication</NavLink>
        <NavLink href="/dashboard/phone">Phone</NavLink>
        <NavLink href="/dashboard/sales">Sales</NavLink>
        <NavLink href="/dashboard/people">People</NavLink>
        <div className="navlabel">Setup</div>
        <NavLink href="/dashboard/connections">Connections</NavLink>
        <NavLink href="/dashboard/settings">Settings</NavLink>
        <div className="spacer" />
        <form action={logout}>
          <button className="navlink btn" style={{ border: 0, background: "none", width: "100%" }}>Log out {user.name.split(" ")[0]}</button>
        </form>
      </nav>
      <main className="main">
        {!user.emailVerifiedAt && <VerifyBanner email={user.email} />}
        {children}
      </main>
    </div>
  );
}
