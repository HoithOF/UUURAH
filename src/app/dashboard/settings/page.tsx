import { db } from "@/lib/db";
import { canManage, requireWorkspace } from "@/lib/workspace";
import { appUrl } from "@/lib/url";
import { AccessKeyForm } from "@/components/AccessKeyForm";
import { SimpleForm } from "@/components/SimpleForm";
import { TwoStepSetup } from "@/components/TwoStepSetup";
import { changePassword, changeRole, disableTwoStep, inviteMember, removeMember, revokeInvite, revokeKey, setTimeZone, signOutOthers } from "./actions";

const ZONES = ["UTC", ...Intl.supportedValuesOf("timeZone")];

export default async function SettingsPage() {
  const { user, workspace, role } = await requireWorkspace();
  const [members, keys, invites] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    db.accessKey.findMany({ where: { workspaceId: workspace.id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.authToken.findMany({ where: { kind: "invite", workspaceId: workspace.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  const manage = canManage(role);
  return (
    <>
      <h1>Settings</h1>
      <p className="muted">{workspace.name} · you are {role === "owner" ? "the owner" : `an ${role}`}</p>
      <h2>Your account</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "start" }}>
        <SimpleForm action={setTimeZone} submit="Save" className="card">
          <label htmlFor="tz" style={{ marginTop: 0 }}>Time zone</label>
          <select id="tz" name="timeZone" defaultValue={user.timeZone} className="btn" style={{ width: "100%" }}>
            {ZONES.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
          <p className="small muted">Used for every date and time you see.</p>
        </SimpleForm>
        <SimpleForm action={changePassword} submit="Change password" className="card">
          <label htmlFor="current" style={{ marginTop: 0 }}>Current password</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required />
          <label htmlFor="newpw">New password</label>
          <input id="newpw" name="password" type="password" autoComplete="new-password" minLength={10} required />
        </SimpleForm>
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Two-step login</div>
          {user.totpEnabledAt ? (
            <SimpleForm action={disableTwoStep} submit="Turn off">
              <p className="small"><span className="badge ok">On</span> You&apos;ll be asked for a code from your phone when you log in.</p>
              <label htmlFor="pw2">Password to turn it off</label>
              <input id="pw2" name="password" type="password" autoComplete="current-password" required />
            </SimpleForm>
          ) : (
            <>
              <p className="small">Ask for a code from your phone at login, so a stolen password isn&apos;t enough. Strongly recommended for owners.</p>
              <TwoStepSetup email={user.email} />
            </>
          )}
        </div>
        <SimpleForm action={signOutOthers} submit="Sign out other devices" className="card">
          <div style={{ fontWeight: 600 }}>Devices</div>
          <p className="small">Signs you out everywhere except this browser.</p>
        </SimpleForm>
      </div>

      <h2>Team</h2>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>
          {members.map((m) => {
            const isMe = m.userId === user.id;
            const canRemove = !isMe && m.role !== "owner" && (role === "owner" || (role === "admin" && m.role === "member"));
            return (
              <tr key={m.id}>
                <td>{m.user.name}{isMe && <span className="muted"> (you)</span>}</td>
                <td>{m.user.email}</td>
                <td>
                  {role === "owner" && !isMe && m.role !== "owner" ? (
                    <form action={changeRole} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={m.id} />
                      <select name="role" defaultValue={m.role} className="btn" aria-label={`Role for ${m.user.name}`}>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                      <button className="btn">Save</button>
                    </form>
                  ) : m.role}
                </td>
                <td>{canRemove && <form action={removeMember}><input type="hidden" name="id" value={m.id} /><button className="btn">Remove</button></form>}</td>
              </tr>
            );
          })}
          {invites.map((i) => (
            <tr key={i.id}>
              <td className="muted">Invited</td>
              <td>{i.email}</td>
              <td>{i.role}</td>
              <td>{manage && <form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><button className="btn">Cancel invite</button></form>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Members see every section. Admins can also connect apps and invite people. The owner can do everything, including changing roles.</p>
      {manage && (
        <SimpleForm action={inviteMember} submit="Send invite" pendingLabel="Sending..." className="card">
          <label htmlFor="invemail" style={{ marginTop: 0 }}>Invite someone by email</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input id="invemail" name="email" type="email" required style={{ flex: 1, minWidth: 200 }} />
            <select name="role" className="btn" aria-label="Role" defaultValue="member">
              <option value="member">member</option>
              {role === "owner" && <option value="admin">admin</option>}
            </select>
          </div>
        </SimpleForm>
      )}
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
        <li>Optional two-step login with an authenticator app, plus one-time recovery codes.</li>
        <li>Repeated wrong passwords are slowed down, and a password reset signs out every device.</li>
        <li>AI access keys are stored only as a one-way hash, and stop working if their creator leaves the team.</li>
      </ul>
    </>
  );
}
