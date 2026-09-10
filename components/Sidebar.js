import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import ThemeToggle from "./ThemeToggle";

const STAFF_LINKS = [
  ["/admin/courses", "Courses", "courses"],
  ["/admin/scenarios", "Roleplays", "scenarios"],
  ["/admin/quizzes", "Assessments", "quizzes"],
  ["/admin/knowledge", "Knowledge Base", "knowledge"],
  ["/admin/classroom", "Classroom", "classroom"],
];

const REPORT_LINKS = [
  ["/admin/reports", "Call Reports", "reports"],
  ["/admin/improvements", "Areas of Improvement", "reports"],
  ["/admin/roleplay-coverage-report", "Roleplay Coverage", "reports"],
  ["/admin/quiz-review", "Assessment Review", "reports"],
  ["/admin/voice-logs", "Voice Call Logs", "reports"],
];

export default function Sidebar({ role, me }) {
  const router = useRouter();
  const path = router.pathname;

  let groups;
  if (role === "admin") {
    groups = [
      { label: null, links: [["/admin", "Overview"]] },
      { label: "Training", links: STAFF_LINKS.map(([h, l]) => [h, l]) },
      { label: "Reports", links: REPORT_LINKS.map(([h, l]) => [h, l]) },
      { label: null, links: [["/admin/employees", "Team"], ["/admin/manage-admins", "Admin Accounts"]] },
    ];
  } else if (role === "trainer") {
    const perms = me?.permissions || {};
    groups = [
      { label: null, links: [["/trainer", "Overview"]] },
      { label: "Training", links: STAFF_LINKS.filter(([, , key]) => perms[key]).map(([h, l]) => [h, l]) },
      { label: "Reports", links: REPORT_LINKS.filter(([, , key]) => perms[key]).map(([h, l]) => [h, l]) },
    ];
  } else {
    groups = [
      { label: null, links: [
        ["/employee", "Dashboard"],
        ["/employee/courses", "Courses"],
        ["/employee/roleplay", "Roleplay"],
        ["/employee/my-calls", "My Calls"],
        ["/employee/improvements", "My Improvement"],
        ["/employee/assessment-scores", "My Assessment Scores"],
        ["/employee/classroom", "Classroom"],
      ] },
    ];
  }

  const isActive = (href) => path === href || (!["/admin", "/employee", "/trainer"].includes(href) && path.startsWith(href));

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // Lets someone jump straight to the log-out button at the bottom
  // without manually scrolling past a long list of nav links.
  const scrollToLogout = () => {
    document.getElementById("sidebar-logout-btn")?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  return (
    <aside className="sidebar" style={{ position: "relative" }}>
      <div className="row-between" style={{ padding: "0 5px" }}>
        <img src="/petpooja.png" alt="Petpooja" className="brand-logo" />
        <ThemeToggle />
      </div>
      <div className="brand-sub" style={{ padding: "0 5px" }}><b>PitchLab</b> · Sales Training</div>

      <button
        onClick={scrollToLogout}
        title="Jump to Log out"
        style={{
          position: "absolute", top: 10, right: 10, zIndex: 5,
          width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--line)",
          background: "var(--card)", cursor: "pointer", fontSize: 14, lineHeight: 1,
        }}
      >
        ↓
      </button>

      <nav className="nav">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label && (
              <div className="mini" style={{ textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, padding: "12px 8px 4px", opacity: 0.65 }}>
                {g.label}
              </div>
            )}
            {g.links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                className={isActive(href) ? "active" : ""}
                onClick={(e) => { e.preventDefault(); router.push(href); }}
              >
                {label}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <div className="spacer" />

      <div className="row-between" style={{ padding: "8px 6px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div className="avatar">
            {(me?.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{me?.full_name}</div>
            <div className="mini" style={{ textTransform: "capitalize" }}>{role}</div>
          </div>
        </div>
      </div>
      <button id="sidebar-logout-btn" className="btn ghost full" onClick={logout} style={{ marginTop: 6 }}>Log out</button>
    </aside>
  );
}
