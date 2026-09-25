import { useEffect, useState } from "react";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";

export default function ScreenshotReview() {
  const { loading, me } = useProfile("admin");
  const [quizzes, setQuizzes] = useState([]);
  const [pickedQuiz, setPickedQuiz] = useState("");
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [employees, setEmployees] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    supabase.from("quizzes").select("id, title").order("created_at", { ascending: false }).then(({ data }) => setQuizzes(data || []));
  }, [loading]);

  const loadQuizData = async (quizId) => {
    setPickedQuiz(quizId);
    if (!quizId) { setQuestions([]); setAttempts([]); return; }
    setBusy(true);
    const [{ data: qs }, { data: att }, { data: emps }] = await Promise.all([
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).eq("question_type", "screenshot").order("sort_order", { ascending: true }),
      supabase.from("quiz_attempts").select("*").eq("quiz_id", quizId).neq("status", "in_progress"),
      supabase.from("profiles").select("id, full_name, team"),
    ]);
    const empMap = {}; (emps || []).forEach((e) => { empMap[e.id] = e; });
    setEmployees(empMap);
    setQuestions(qs || []);
    setAttempts(att || []);
    setBusy(false);
  };

  const submissionsForQuestion = (questionId) => {
    return attempts
      .map((att) => {
        const entry = (att.ai_review || []).find((r) => r.questionId === questionId);
        if (!entry) return null;
        return {
          attemptId: att.id,
          employee: employees[att.user_id]?.full_name || "Unknown",
          team: employees[att.user_id]?.team || "",
          paths: entry.paths || [],
          correct: entry.adminOverride !== null && entry.adminOverride !== undefined ? entry.adminOverride : entry.correct,
          feedback: entry.feedback,
          status: att.status,
        };
      })
      .filter(Boolean);
  };

  const exportCsv = () => {
    const header = ["Employee", "Team", "Question", "Status", "AI/Admin Verdict", "Feedback", "Image Links"];
    const rows = [];
    questions.forEach((q) => {
      submissionsForQuestion(q.id).forEach((s) => {
        rows.push([
          s.employee, s.team, q.question.replace(/,/g, " "), s.status,
          s.correct ? "Correct" : "Incorrect", (s.feedback || "").replace(/,/g, " "), s.paths.join(" | "),
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
      });
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "screenshot-submissions.csv";
    a.click();
  };

  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <div className="page-hero theme-mint">
          <div className="page-hero-text">
            <h1>Screenshot Submissions by Question</h1>
            <p>Pick an assessment to see every employee's screenshot answer, grouped by question.</p>
          </div>
          <div className="page-hero-glyph">📷</div>
        </div>

        <div className="card pad" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field" style={{ marginBottom: 0, minWidth: 280 }}>
              <span>Assessment</span>
              <select value={pickedQuiz} onChange={(e) => loadQuizData(e.target.value)}>
                <option value="">Choose an assessment…</option>
                {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </label>
            {pickedQuiz && (
              <button className="btn outline" onClick={exportCsv}>⬇ Export list to Excel</button>
            )}
          </div>
        </div>

        {busy && <div className="mini">Loading submissions…</div>}

        {!busy && pickedQuiz && questions.length === 0 && (
          <div className="card pad mini">This assessment has no screenshot questions.</div>
        )}

        {!busy && questions.map((q, qi) => {
          const subs = submissionsForQuestion(q.id);
          return (
            <div key={q.id} className="card pad" style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Q{qi + 1}. {q.question}</div>
              <div className="mini" style={{ marginBottom: 14 }}>{subs.length} submission{subs.length === 1 ? "" : "s"}</div>

              {subs.length === 0 ? (
                <div className="mini">No submissions yet for this question.</div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {subs.map((s, si) => (
                    <div key={si} className="tile">
                      <div className="row-between" style={{ marginBottom: 8 }}>
                        <div>
                          <b style={{ fontSize: 13 }}>{s.employee}</b>
                          {s.team && <span className="mini"> · {s.team}</span>}
                          {s.status === "pending_review" && <span className="pill" style={{ marginLeft: 8, background: "#fff4e0", color: "#946200" }}>Pending review</span>}
                        </div>
                        <span className={`pill ${s.correct ? "" : "gray"}`} style={s.correct ? { background: "#e8f6ee", color: "#15803d" } : {}}>
                          {s.correct ? "✓ Correct" : "✕ Incorrect"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        {s.paths.length === 0 && <span className="mini">No screenshot on file.</span>}
                        {s.paths.map((url, pi) => (
                          <img key={pi} src={url} alt={`${s.employee} submission ${pi + 1}`} style={{ maxWidth: 200, maxHeight: 200, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)" }} />
                        ))}
                      </div>
                      {s.feedback && <div className="mini">{s.feedback}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
