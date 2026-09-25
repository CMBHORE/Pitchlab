import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

const PARAMETERS = [
  "Product Knowledge", "Understanding Customer Needs", "Mapping Customer Pain Points to Solutions",
  "Communication & Confidence", "Objection Handling", "Rapport Building", "Overall Sales Readiness",
];
const SHORT_LABEL = {
  "Product Knowledge": "Product", "Understanding Customer Needs": "Needs",
  "Mapping Customer Pain Points to Solutions": "Pain→Fit", "Communication & Confidence": "Comms",
  "Objection Handling": "Objections", "Rapport Building": "Rapport", "Overall Sales Readiness": "Readiness",
};
// Rich multi-hue palettes, matching the reference's colorful bar charts
// instead of one flat brand color repeated everywhere.
const SKILL_COLORS = ["#7367f0", "#9c6ff2", "#d968c9", "#ea5f9c", "#e0526a", "#ff9f43", "#1e9e5a"];
const BAND_COLORS = ["#ff6b6b", "#ffb020", "#2f8fff", "#1fb87a"];
const TEAM_BAR_COLORS = ["#7367f0", "#9c6ff2", "#d968c9", "#ea5f9c", "#e0526a", "#ff9f43", "#1e9e5a", "#4cb85c"];

export default function AdminHome() {
  const { loading, me } = useProfile("admin");
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [paramData, setParamData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [bandData, setBandData] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [teamPerf, setTeamPerf] = useState([]);

  const isScoped = me?.role === "trainer";
  const scopedTeams = new Set(me?.assigned_teams || []);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const [{ data: allEmps }, { data: courses }, { data: lessons }, { data: enr }, { data: prog }, { data: results }] =
        await Promise.all([
          supabase.from("profiles").select("id, full_name, team").eq("role", "employee"),
          supabase.from("courses").select("id"),
          supabase.from("lessons").select("id, course_id"),
          supabase.from("enrollments").select("user_id, course_id"),
          supabase.from("lesson_progress").select("user_id, lesson_id"),
          supabase.from("roleplay_results").select("user_id, overall, parameter_scores, created_at").order("created_at", { ascending: true }),
        ]);

      const emps = isScoped ? (allEmps || []).filter((e) => scopedTeams.has(e.team?.trim())) : (allEmps || []);
      const empIds = new Set(emps.map((e) => e.id));
      const scopedResults = (results || []).filter((r) => empIds.has(r.user_id));

      const lessonsByCourse = {};
      (lessons || []).forEach((l) => { (lessonsByCourse[l.course_id] = lessonsByCourse[l.course_id] || []).push(l.id); });
      const doneByUser = {};
      (prog || []).forEach((p) => { (doneByUser[p.user_id] = doneByUser[p.user_id] || new Set()).add(p.lesson_id); });

      let sum = 0, n = 0;
      const bands = { "0-25%": 0, "25-50%": 0, "50-75%": 0, "75-100%": 0 };
      const empCompletion = {};
      emps.forEach((e) => {
        const myCourses = (enr || []).filter((x) => x.user_id === e.id).map((x) => x.course_id);
        const total = myCourses.reduce((a, cid) => a + (lessonsByCourse[cid] || []).length, 0);
        const done = myCourses.reduce((a, cid) => a + (lessonsByCourse[cid] || []).filter((lid) => doneByUser[e.id]?.has(lid)).length, 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        empCompletion[e.id] = pct;
        if (total > 0) { sum += pct; n += 1; }
        if (pct <= 25) bands["0-25%"] += 1;
        else if (pct <= 50) bands["25-50%"] += 1;
        else if (pct <= 75) bands["50-75%"] += 1;
        else bands["75-100%"] += 1;
      });

      const paramSums = {}; const paramCounts = {};
      scopedResults.forEach((r) => {
        PARAMETERS.forEach((p) => {
          const v = r.parameter_scores?.[p]?.score;
          if (typeof v === "number") { paramSums[p] = (paramSums[p] || 0) + v; paramCounts[p] = (paramCounts[p] || 0) + 1; }
        });
      });
      const paramChart = PARAMETERS.map((p) => ({
        name: SHORT_LABEL[p], score: paramCounts[p] ? Math.round(paramSums[p] / paramCounts[p]) : 0,
      }));

      const byDay = {};
      scopedResults.forEach((r) => {
        const day = new Date(r.created_at).toISOString().slice(0, 10);
        (byDay[day] = byDay[day] || []).push(r.overall || 0);
      });
      const days = Object.keys(byDay).sort().slice(-30);
      const trend = days.map((d) => ({
        date: d.slice(5), avg: Math.round(byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length),
      }));

      const board = emps.map((e) => {
        const mine = scopedResults.filter((r) => r.user_id === e.id);
        const avg = mine.length ? Math.round(mine.reduce((a, r) => a + (r.overall || 0), 0) / mine.length) : 0;
        return { id: e.id, name: e.full_name, avg, plays: mine.length };
      }).filter((e) => e.plays > 0).sort((a, b) => b.avg - a.avg).slice(0, 6);

      const { data: sessions } = await supabase
        .from("live_sessions").select("*").gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true }).limit(3);

      const teamGroups = {};
      emps.forEach((e) => {
        const t = e.team?.trim() || "Unassigned";
        (teamGroups[t] = teamGroups[t] || []).push(e);
      });
      const teamPerformance = Object.entries(teamGroups).map(([team, members]) => {
        const memberIds = new Set(members.map((m) => m.id));
        const teamResults = scopedResults.filter((r) => memberIds.has(r.user_id));
        const avgScore = teamResults.length ? Math.round(teamResults.reduce((a, r) => a + (r.overall || 0), 0) / teamResults.length) : 0;
        return { team, employees: members.length, avgScore };
      }).sort((a, b) => b.avgScore - a.avgScore);

      setStats({ employees: emps.length, courses: (courses || []).length, avg: n ? Math.round(sum / n) : 0, calls: scopedResults.length });
      setParamData(paramChart);
      setTrendData(trend);
      setBandData(Object.entries(bands).map(([name, value]) => ({ name, value })));
      setLeaderboard(board);
      setUpcoming(sessions || []);
      setTeamPerf(teamPerformance);
    })();
  }, [loading, isScoped]);

  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <div className="page-hero theme-violet">
          <div className="page-hero-text">
            <h1>Welcome, {me.full_name.split(" ")[0]}</h1>
            <p>Petpooja PitchLab — {isScoped ? `showing ${(me.assigned_teams || []).join(", ") || "no teams assigned"}` : "company-wide admin console"}.</p>
          </div>
          <div className="page-hero-glyph">📈</div>
        </div>

        <div className="grid4">
          <div className="card kpi-card grad">
            <div className="kpi-top"><div className="kpi-icon-circle">👥</div></div>
            <div className="kpi-value">{stats?.employees ?? "…"}</div>
            <div className="kpi-label">{isScoped ? "Employees (your teams)" : "Total Employees"}</div>
          </div>
          <div className="card kpi-card plain">
            <div className="kpi-top"><div className="kpi-icon-circle violet">📚</div></div>
            <div className="kpi-value">{stats?.courses ?? "…"}</div>
            <div className="kpi-label">Active Courses</div>
          </div>
          <div className="card kpi-card plain">
            <div className="kpi-top"><div className="kpi-icon-circle blue">🎯</div></div>
            <div className="kpi-value">{stats?.avg ?? "…"}%</div>
            <div className="kpi-label">Avg. Completion Rate</div>
          </div>
          <div className="card kpi-card plain">
            <div className="kpi-top"><div className="kpi-icon-circle" style={{ background: "var(--amber-soft)", color: "#b3740c" }}>🎤</div></div>
            <div className="kpi-value">{stats?.calls ?? "…"}</div>
            <div className="kpi-label">Roleplay Calls Scored</div>
          </div>
        </div>

        <div className="dash" style={{ marginTop: 20 }}>
          <div className="stack">
            <div className="grid2">
              <div className="card pad">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Team strength by skill</div>
                <div className="mini" style={{ marginBottom: 12 }}>Average score across every scored call, per audit parameter.</div>
                {paramData.length > 0 && paramData.some((d) => d.score > 0) ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={paramData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "var(--card-2)" }} />
                      <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                        {paramData.map((_, i) => <Cell key={i} fill={SKILL_COLORS[i % SKILL_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="mini" style={{ padding: 24 }}>No scored calls yet.</div>}
              </div>

              <div className="card pad">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Team completion</div>
                <div className="mini" style={{ marginBottom: 12 }}>Employees grouped by course completion.</div>
                {bandData.some((d) => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={bandData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={4} cornerRadius={6}>
                        {bandData.map((entry, i) => <Cell key={i} fill={BAND_COLORS[i]} />)}
                      </Pie>
                      <Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div className="mini" style={{ padding: 24 }}>No employees yet.</div>}
              </div>
            </div>

            {teamPerf.length > 1 && (
              <div className="card pad">
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Avg. score by team</div>
                <div className="mini" style={{ marginBottom: 12 }}>Comparing every team's average roleplay score, highest first.</div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={teamPerf}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="team" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} cursor={{ fill: "var(--card-2)" }} />
                    <Bar dataKey="avgScore" radius={[8, 8, 0, 0]}>
                      {teamPerf.map((_, i) => <Cell key={i} fill={TEAM_BAR_COLORS[i % TEAM_BAR_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="card pad">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Team score trend</div>
              <div className="mini" style={{ marginBottom: 12 }}>Average roleplay score by day, last 30 days.</div>
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#696cff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#696cff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted)" }} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }} />
                    <Area type="monotone" dataKey="avg" stroke="#696cff" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: "#696cff" }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="mini" style={{ padding: 24 }}>Not enough calls yet to show a trend — needs at least 2 different days of activity.</div>}
            </div>

            <div className="grid2">
              <div className="card pad">
                <div style={{ fontWeight: 700 }}>Build training</div>
                <div className="mini" style={{ marginBottom: 12 }}>Create courses and roleplay scenarios.</div>
                <button className="btn primary" onClick={() => router.push("/admin/courses")}>Manage courses</button>
              </div>
              <div className="card pad">
                <div style={{ fontWeight: 700 }}>Your team</div>
                <div className="mini" style={{ marginBottom: 12 }}>Add people and assign them training.</div>
                <button className="btn dark" onClick={() => router.push("/admin/employees")}>Manage team</button>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card pad">
              <div className="card-head"><div style={{ fontWeight: 700 }}>🏆 Top performers</div></div>
              {leaderboard.length === 0 ? (
                <div className="mini">No scored calls yet on the team.</div>
              ) : (
                leaderboard.map((e, i) => (
                  <div key={e.id} className="lb-row">
                    <div className={`lb-rank ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : ""}`}>{i + 1}</div>
                    <div className="lb-name">{e.name}</div>
                    <div className="lb-score">{e.avg}</div>
                  </div>
                ))
              )}
            </div>

            <div className="card pad">
              <div className="card-head"><div style={{ fontWeight: 700 }}>📅 Upcoming sessions</div></div>
              {upcoming.length === 0 ? (
                <div className="mini">No live sessions scheduled.</div>
              ) : (
                upcoming.map((s) => (
                  <div key={s.id} className="session" style={{ marginBottom: 12 }}>
                    <div className="session-icon">🎥</div>
                    <div>
                      <div className="session-title">{s.title}</div>
                      <div className="session-when">{new Date(s.scheduled_at).toLocaleString()}</div>
                    </div>
                  </div>
                ))
              )}
              <button className="btn outline full" style={{ marginTop: 4 }} onClick={() => router.push("/admin/classroom")}>Manage classroom</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
