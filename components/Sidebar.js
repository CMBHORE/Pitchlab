import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import ThemeToggle from "./ThemeToggle";

const STAFF_LINKS = [
  ["/admin/courses", "Courses", "courses", "📚", "violet"],
  ["/admin/scenarios", "Roleplays", "scenarios", "🎭", "coral"],
  ["/admin/quizzes", "Assessments", "quizzes", "📝", "mint"],
  ["/admin/knowledge", "Knowledge Base", "knowledge", "📖", "amber"],
  ["/admin/classroom", "Classroom", "classroom", "👨‍🏫", "blue"],
];

const REPORT_LINKS = [
  ["/admin/reports", "Call Reports", "reports", "📊", "violet"],
  ["/admin/improvements", "Areas of Improvement", "reports", "📈", "mint"],
  ["/admin/roleplay-coverage-report", "Roleplay Coverage", "reports", "🎭", "coral"],
  ["/admin/quiz-review", "Assessment Review", "reports", "📋", "amber"],
  ["/admin/voice-logs", "Voice Call Logs", "reports", "💻", "blue"],
  ["/admin/screenshot-review", "Screenshot Submissions", "reports", "📷", "gray"],
];

function iconBtnStyle() {
  return {
    width: 32, height: 32, borderRadius: "50%",
    border: "1px solid var(--line)", background: "var(--card)",
    display: "grid", placeItems: "center", cursor: "pointer", fontSize: 14,
  };
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

export default function Sidebar({ role, me }) {
  const router = useRouter();
  const path = router.pathname;

  // Which grouped section is currently expanded — clicking a group's
  // header (a "tab") reveals its links, like a folder opening.
  // The group containing the page you're currently on starts open.
  const initialOpenGroup = REPORT_LINKS.some(([h]) => path.startsWith(h)) ? "Reports"
    : STAFF_LINKS.some(([h]) => path.startsWith(h)) ? "Training" : null;
  const [openGroup, setOpenGroup] = useState(initialOpenGroup);

  let groups;
  if (role === "admin") {
    groups = [
      { label: null, links: [["/admin", "Overview", null, "📈", "violet"]] },
      { label: "Training", links: STAFF_LINKS.map(([h, l]) => [h, l]) },
      { label: "Reports", links: REPORT_LINKS.map(([h, l]) => [h, l]) },
      {
        label: null,
        links: me?.role === "admin"
          ? [["/admin/employees", "Team", null, "🧑‍🤝‍🧑", "coral"], ["/admin/manage-admins", "Admin Accounts", null, "⚙️", "gray"], ["/admin/admin-activity", "Admin Activity", null, "📊", "blue"], ["/admin/gallery", "Gallery", null, "🖼️", "coral"]]
          : [["/admin/employees", "Team", null, "🧑‍🤝‍🧑", "coral"]],
      },
    ];
  } else if (role === "trainer") {
    const perms = me?.permissions || {};
    groups = [
      { label: null, links: [["/trainer", "Overview", null, "📈", "violet"]] },
      { label: "Training", links: STAFF_LINKS.filter(([, , key]) => perms[key]).map(([h, l]) => [h, l]) },
      { label: "Reports", links: REPORT_LINKS.filter(([, , key]) => perms[key]).map(([h, l]) => [h, l]) },
    ];
  } else {
    groups = [
      { label: null, links: [
        ["/employee", "Dashboard", null, "📈", "violet"],
        ["/employee/courses", "Courses", null, "📚", "violet"],
        ["/employee/roleplay", "Roleplay", null, "🎭", "coral"],
        ["/employee/my-calls", "My Calls", null, "💻", "blue"],
        ["/employee/improvements", "My Improvement", null, "🥇", "amber"],
        ["/employee/assessment-scores", "My Assessment Scores", null, "🏆", "amber"],
        ["/employee/classroom", "Classroom", null, "👨‍🏫", "mint"],
      ] },
    ];
  }

  const isActive = (href) => path === href || (!["/admin", "/employee", "/trainer"].includes(href) && path.startsWith(href));

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const initials = (me?.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar" style={{ position: "relative" }}>
      <div style={{ padding: "0 5px", marginBottom: 6 }}>
        <img src="/petpooja.png" alt="Petpooja" className="brand-logo" />
      </div>
      <div className="brand-sub" style={{ padding: "0 5px" }}><b>PitchLab</b> · Sales Training</div>

      {/* Theme · Fullscreen · Notifications · Profile · Settings — pinned
          to the actual top-right corner of the whole page (not the
          sidebar column), matching the reference's topbar strip. Rendered
          from here so it appears automatically on every logged-in page. */}
      <div style={{ position: "fixed", top: 16, right: 24, zIndex: 40, display: "flex", gap: 6, alignItems: "center" }}>
        <ThemeToggle />
        <button title="Fullscreen" onClick={toggleFullscreen} style={iconBtnStyle()}>⛶</button>
        <button title="Notifications" style={iconBtnStyle()}>🔔</button>
        <button
          title="My Profile"
          onClick={() => router.push("/profile")}
          style={{ ...iconBtnStyle(), background: "linear-gradient(135deg, var(--brand), var(--brand-600))", color: "#fff", border: "none", fontWeight: 700, fontSize: 11 }}
        >
          {initials}
        </button>
        <button title="Settings" onClick={() => router.push("/profile")} style={iconBtnStyle()}>⚙️</button>
      </div>

      <nav className="nav">
        {groups.map((g, gi) => {
          const isExpandable = !!g.label;
          const isOpen = !isExpandable || openGroup === g.label;
          return (
            <div key={gi}>
              {g.label && (
                <div
                  onClick={() => setOpenGroup(isOpen ? null : g.label)}
                  className="mini"
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                    textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, padding: "12px 8px 4px", opacity: 0.75,
                  }}
                >
                  <span>{g.label}</span>
                  <span style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: 11 }}>▸</span>
                </div>
              )}
              {isOpen && g.links.map(([href, label, , icon, color]) => (
                <a
                  key={href}
                  href={href}
                  className={isActive(href) ? "active" : ""}
                  onClick={(e) => { e.preventDefault(); router.push(href); }}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  {icon && <span className={`nav-icon ${color || "gray"}`}>{icon}</span>}
                  {label}
                </a>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="spacer" />
      <button id="sidebar-logout-btn" className="btn ghost full" onClick={logout}>Log out</button>
    </aside>
  );
}
