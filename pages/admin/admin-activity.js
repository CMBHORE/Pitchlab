import { useEffect, useState } from "react";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";

export default function AdminActivity() {
  const { loading, me } = useProfile("admin");
  const [admins, setAdmins] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [calls, setCalls] = useState([]);
  const [attempts, setAttempts] = useState([]);

  useEffect(() => {
    if (loading || me?.role !== "admin") return;
    (async () => {
      const [{ data: adm }, { data: emp }, { data: cl }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, role, assigned_teams").in("role", ["admin", "trainer"]),
        supabase.from("profiles").select("id, team").eq("role", "employee"),
        supabase.from("roleplay_results").select("id, user_id, overall, created_at"),
        supabase.from("quiz_attempts").select("id, user_id, score, passed, status, reviewed_by, reviewed_at, submitted_at"),
      ]);
      setAdmins(adm || []);
      setEmployees(emp || []);
      setCalls(cl || []);
      setAttempts(att || []);
    })();
  }, [loading, me]);

  if (!loading && me?.role !== "admin") {
    return (
      <div className="shell">
        <Sidebar role={me?.role} me={me} />
        <main className="content"><div className="card pad mini">Only a Super Admin can view this.</div></main>
      </div>
    );
  }
  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentCalls = calls.filter((c) => new Date(c.created_at) >= thirtyDaysAgo);
  const recentAttempts = attempts.filter((a) => a.submitted_at && new Date(a.submitted_at) >= thirtyDaysAgo);
  const avgScore = calls.length ? Math.round(calls.reduce((s, c) => s + (c.overall || 0), 0) / calls.length) : 0;
  const passRate = attempts.filter((a) => a.status !== "in_progress").length
    ? Math.round((attempts.filter((a) => a.passed).length / attempts.filter((a) => a.status !== "in_progress").length) * 100)
    : 0;

  const adminStats = admins.map((a) => {
    const reviewedCount = attempts.filter((att) => att.reviewed_by === a.id).length;
    const teams = a.role === "admin" ? "All teams" : (a.assigned_teams || []).join(", ") || "No teams assigned";
    const teamEmployeeCount = a.role === "admin"
      ? employees.length
      : employees.filter((e) => (a.assigned_teams || []).includes(e.team?.trim())).length;
    const lastActive = attempts.filter((att) => att.reviewed_by === a.id).sort((x, y) => new Date(y.reviewed_at) - new Date(x.reviewed_at))[0]?.reviewed_at;
    return { ...a, reviewedCount, teams, teamEmployeeCount, lastActive };
  }).sort((a, b) => b.reviewedCount - a.reviewedCount);

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <h1 className="page">Admin & Employee Activity</h1>
        <p className="sub">A Super Admin's view of who's doing what across the whole platform.</p>

        <div className="grid4" style={{ marginBottom: 22 }}>
          <div className="tile"><div className="kpi">{employees.length}</div><div className="kpi-label">Total employees</div></div>
          <div className="tile"><div className="kpi">{admins.length}</div><div className="kpi-label">Admin accounts</div></div>
          <div className="tile"><div className="kpi">{recentCalls.length}</div><div className="kpi-label">Calls (last 30 days)</div></div>
          <div className="tile"><div className="kpi">{avgScore}</div><div className="kpi-label">Company avg. call score</div></div>
        </div>

        <div className="grid3" style={{ marginBottom: 22 }}>
          <div className="tile"><div className="kpi">{calls.length}</div><div className="kpi-label">All-time calls</div></div>
          <div className="tile"><div className="kpi">{recentAttempts.length}</div><div className="kpi-label">Assessments (last 30 days)</div></div>
          <div className="tile"><div className="kpi">{passRate}%</div><div className="kpi-label">Assessment pass rate</div></div>
        </div>

        <div className="section-label">Admin performance</div>
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Teams covered</th><th>Employees under them</th><th>Assessments reviewed</th><th>Last review</th></tr></thead>
            <tbody>
              {adminStats.length === 0 && <tr><td colSpan={6} className="mini" style={{ padding: 20 }}>No admin accounts yet.</td></tr>}
              {adminStats.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.full_name}</b><div className="mini">{a.email}</div></td>
                  <td>{a.role === "admin" ? <span className="pill red">Super Admin</span> : <span className="pill">Scoped Admin</span>}</td>
                  <td className="mini">{a.teams}</td>
                  <td className="mini">{a.teamEmployeeCount}</td>
                  <td><span className={`pill ${a.reviewedCount > 0 ? "" : "gray"}`} style={a.reviewedCount > 0 ? { background: "#e8f6ee", color: "#15803d" } : {}}>{a.reviewedCount}</span></td>
                  <td className="mini">{a.lastActive ? new Date(a.lastActive).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
