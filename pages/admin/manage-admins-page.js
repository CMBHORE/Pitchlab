import { useEffect, useState } from "react";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";

const FEATURES = [
  ["courses", "Courses"],
  ["scenarios", "Roleplays"],
  ["quizzes", "Assessments"],
  ["knowledge", "Knowledge Base"],
  ["classroom", "Classroom"],
  ["reports", "Reports (Call Reports, Assessment Review, etc.)"],
  ["employees", "Team management"],
];

export default function ManageAdmins() {
  const { loading, me } = useProfile("admin");
  const [admins, setAdmins] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({ full_name: "", email: "", password: "", permissions: {}, assigned_teams: [] });

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" };
  };

  const load = async () => {
    const res = await fetch("/api/manage-admins", { headers: await authHeader() });
    const json = await res.json();
    if (res.ok) setAdmins(json.admins || []);
    const { data: emps } = await supabase.from("profiles").select("team").eq("role", "employee");
    setAllTeams([...new Set((emps || []).map((e) => e.team?.trim()).filter(Boolean))].sort());
  };
  useEffect(() => { if (!loading) load(); }, [loading]);

  // Only a true Super Admin should ever land here — anyone else (a
  // scoped trainer) gets sent back, since granting/editing admin access
  // is not something a scoped admin should ever be able to do.
  if (!loading && me?.role !== "admin") {
    return (
      <div className="shell">
        <Sidebar role={me?.role} me={me} />
        <main className="content"><div className="card pad mini">Only a Super Admin can manage admin accounts.</div></main>
      </div>
    );
  }

  const togglePermission = (key) => setForm({ ...form, permissions: { ...form.permissions, [key]: !form.permissions[key] } });
  const toggleTeam = (team) => {
    const has = form.assigned_teams.includes(team);
    setForm({ ...form, assigned_teams: has ? form.assigned_teams.filter((t) => t !== team) : [...form.assigned_teams, team] });
  };

  const startEdit = (admin) => {
    setEditingId(admin.id);
    setForm({ full_name: admin.full_name, email: admin.email, password: "", permissions: admin.permissions || {}, assigned_teams: admin.assigned_teams || [] });
  };
  const cancelEdit = () => { setEditingId(null); setForm({ full_name: "", email: "", password: "", permissions: {}, assigned_teams: [] }); };

  const create = async (e) => {
    e.preventDefault();
    setMsg(null); setBusy(true);
    const res = await fetch("/api/manage-admins", { method: "POST", headers: await authHeader(), body: JSON.stringify(form) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ type: "err", text: json.error }); return; }
    setMsg({ type: "ok", text: `${form.full_name} can now log in as an admin with the rights you set.` });
    cancelEdit();
    load();
  };

  const saveEdit = async () => {
    setMsg(null); setBusy(true);
    const res = await fetch("/api/manage-admins", { method: "PATCH", headers: await authHeader(), body: JSON.stringify({ id: editingId, permissions: form.permissions, assigned_teams: form.assigned_teams }) });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ type: "err", text: json.error }); return; }
    setMsg({ type: "ok", text: "Rights updated." });
    cancelEdit();
    load();
  };

  const remove = async (admin) => {
    if (!confirm(`Remove ${admin.full_name}'s admin access? They will no longer be able to log in.`)) return;
    const res = await fetch("/api/manage-admins", { method: "DELETE", headers: await authHeader(), body: JSON.stringify({ id: admin.id }) });
    const json = await res.json();
    if (!res.ok) { setMsg({ type: "err", text: json.error }); return; }
    setMsg({ type: "ok", text: `${admin.full_name} removed.` });
    load();
  };

  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <h1 className="page">Admin Accounts</h1>
        <p className="sub">Create scoped admins — pick exactly which features they can use, and which teams' data they can see. Only you (Super Admin) can do this.</p>
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

        <div className="card pad" style={{ marginBottom: 22 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>{editingId ? "Edit rights" : "Create a new admin"}</div>
          <form onSubmit={editingId ? (e) => { e.preventDefault(); saveEdit(); } : create}>
            {!editingId && (
              <div className="grid2">
                <label className="field"><span>Full name</span>
                  <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
                <label className="field"><span>Email (their login)</span>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
                <label className="field"><span>Temporary password</span>
                  <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="min 6 characters" required minLength={6} /></label>
              </div>
            )}
            {editingId && <div className="mini" style={{ marginBottom: 12 }}>Editing rights for <b>{form.full_name}</b> ({form.email})</div>}

            <div className="mini" style={{ fontWeight: 700, marginBottom: 8 }}>Which features can they use?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {FEATURES.map(([key, label]) => (
                <button type="button" key={key} className={`chipbtn ${form.permissions[key] ? "on" : ""}`} onClick={() => togglePermission(key)}>
                  {form.permissions[key] ? "✓ " : ""}{label}
                </button>
              ))}
            </div>

            <div className="mini" style={{ fontWeight: 700, marginBottom: 8 }}>Which teams can they see? (leave empty = sees no team data)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {allTeams.length === 0 && <span className="mini">No teams exist yet — add employees with a team first.</span>}
              {allTeams.map((t) => (
                <button type="button" key={t} className={`chipbtn ${form.assigned_teams.includes(t) ? "on" : ""}`} onClick={() => toggleTeam(t)}>
                  {form.assigned_teams.includes(t) ? "✓ " : ""}{t}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save rights" : "Create admin"}</button>
              {editingId && <button type="button" className="btn ghost" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>

        <div className="section-label">Existing admins</div>
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Teams</th><th></th></tr></thead>
            <tbody>
              {admins.length === 0 && <tr><td colSpan={5} className="mini" style={{ padding: 20 }}>No admin accounts yet besides yourself.</td></tr>}
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.full_name}</b></td>
                  <td className="mini">{a.email}</td>
                  <td>{a.role === "admin" ? <span className="pill red">Super Admin</span> : <span className="pill">Scoped Admin</span>}</td>
                  <td className="mini">{a.role === "admin" ? "All" : (a.assigned_teams || []).join(", ") || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {a.role === "trainer" && (
                      <>
                        <button className="btn ghost sm" onClick={() => startEdit(a)}>Edit rights</button>
                        <button className="btn danger sm" onClick={() => remove(a)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
