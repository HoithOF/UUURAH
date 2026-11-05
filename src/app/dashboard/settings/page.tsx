import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export default async function SettingsPage() {
  const { workspace, role } = await requireWorkspace();
  const members = await db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <h1>Settings</h1>
      <p className="muted">{workspace.name} · you are {role === "owner" ? "the owner" : `an ${role}`}</p>
      <h2>Team</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}><td>{m.user.name}</td><td>{m.user.email}</td><td>{m.role}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 12 }}>Inviting teammates by email comes with the next step, once an email provider is chosen.</p>
      <h2>Security</h2>
      <ul className="small">
        <li>Passwords are hashed with bcrypt; we never store them in readable form.</li>
        <li>Every connected app&apos;s sign-in token is encrypted with AES-256-GCM before it&apos;s saved.</li>
        <li>Each company&apos;s data is kept separate; every query is scoped to your workspace.</li>
        <li>We request read-only access wherever the app offers it.</li>
      </ul>
    </>
  );
}
