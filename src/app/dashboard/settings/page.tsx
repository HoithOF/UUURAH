import { db } from "@/lib/db";
import { canManage, requireWorkspace } from "@/lib/workspace";
import { appUrl } from "@/lib/url";
import { AccessKeyForm } from "@/components/AccessKeyForm";
import { revokeKey } from "./actions";

export default async function SettingsPage() {
  const { workspace, role } = await requireWorkspace();
  const [members, keys] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.accessKey.findMany({ where: { workspaceId: workspace.id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  const manage = canManage(role);
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
      <h2>Connect your AI</h2>
      <p className="small">
        Let your own AI app (Claude Code or any MCP app that accepts an access key) read this business&apos;s numbers. Give it this address and
        a key from below. It can only read; it can&apos;t send, change or pay anything.
      </p>
      <code style={{ display: "block", padding: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8 }}>{appUrl("/api/mcp")}</code>
      {keys.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Key</th><th>Ends in</th><th>Last used</th><th /></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td><code>...{k.lastFour}</code></td>
                <td>{k.lastUsedAt ? k.lastUsedAt.toISOString().slice(0, 10) : "Never"}</td>
                <td>{manage && <form action={revokeKey}><input type="hidden" name="id" value={k.id} /><button className="btn">Turn off</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {manage ? <AccessKeyForm /> : <p className="small muted">Ask an owner or admin to create a key.</p>}
      <h2>Security</h2>
      <ul className="small">
        <li>Passwords are hashed with bcrypt; we never store them in readable form.</li>
        <li>Every connected app&apos;s sign-in token is encrypted with AES-256-GCM before it&apos;s saved.</li>
        <li>Each company&apos;s data is kept separate; every query is scoped to your workspace.</li>
        <li>We request read-only access wherever the app offers it.</li>
        <li>AI access keys are stored only as a one-way hash, and stop working if their creator leaves the team.</li>
      </ul>
    </>
  );
}
