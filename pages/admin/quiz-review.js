import { useEffect, useState } from "react";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";

export default function QuizReview() {
  const { loading, me } = useProfile("admin");
  const [attempts, setAttempts] = useState([]);
  const [employees, setEmployees] = useState({}); // id -> { full_name, team }
  const [quizzes, setQuizzes] = useState({});
  const [tab, setTab] = useState("pending");
  const [pendingCount, setPendingCount] = useState(0);
  const [filterTeam, setFilterTeam] = useState("all");

  const [open, setOpen] = useState(null); // attempt being reviewed
  const [reviewItems, setReviewItems] = useState([]); // unified list: screenshot + MCQ
  const [overrides, setOverrides] = useState({}); // questionId -> boolean
  const [reviewIndex, setReviewIndex] = useState(0);
  const [finalizing, setFinalizing] = useState(false);

  const load = async () => {
    const [{ data: pending }, { data: completed }, { data: emps }, { data: qz }] = await Promise.all([
      supabase.from("quiz_attempts").select("*").eq("status", "pending_review").order("submitted_at", { ascending: true }),
      supabase.from("quiz_attempts").select("*").eq("status", "completed").order("submitted_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id, full_name, team").eq("role", "employee"),
      supabase.from("quizzes").select("id, title"),
    ]);
    const empMap = {}; (emps || []).forEach((e) => { empMap[e.id] = { full_name: e.full_name, team: e.team || "" }; });
    const qzMap = {}; (qz || []).forEach((q) => { qzMap[q.id] = q.title; });
    setEmployees(empMap);
    setQuizzes(qzMap);
    setAttempts(tab === "pending" ? (pending || []) : (completed || []));
    setPendingCount((pending || []).length);
  };
  useEffect(() => { if (!loading) load(); }, [loading, tab]);

  const teamOptions = Array.from(new Set(Object.values(employees).map((e) => e.team).filter(Boolean))).sort();
  const visibleAttempts = attempts.filter((a) => filterTeam === "all" || (employees[a.user_id]?.team || "") === filterTeam);

  // Opens ANY attempt (pending or already-completed) for a full manual
  // review — every question, screenshot or multiple-choice, side by side
  // with what the employee actually answered.
  const openAttempt = async (attempt) => {
    setOpen(attempt);
    setOverrides({ ...(attempt.mcq_overrides || {}) });
    setReviewIndex(0);

    const { data: questions } = await supabase.from("quiz_questions").select("*").eq("quiz_id", attempt.quiz_id).order("sort_order", { ascending: true });
    const aiReviewByQ = {};
    (attempt.ai_review || []).forEach((r) => { aiReviewByQ[r.questionId] = r; });

    const items = [];
    for (const q of questions || []) {
      if (q.question_type === "screenshot") {
        const r = aiReviewByQ[q.id];
        items.push({
          type: "screenshot", questionId: q.id, question: q.question,
          paths: r?.paths || [], aiCorrect: r?.correct ?? false, aiFeedback: r?.feedback || "No AI review recorded.",
        });
      } else {
        const a = (attempt.answers || {})[q.id];
        const correctSet = new Set(Array.isArray(q.correct_indices) ? q.correct_indices : [q.correct_index]);
        let baseCorrect;
        if (q.multi_correct) {
          const chosen = new Set(a?.chosenIndices || []);
          baseCorrect = chosen.size === correctSet.size && [...chosen].every((i) => correctSet.has(i));
        } else {
          baseCorrect = a?.chosenIndex !== undefined && correctSet.has(a.chosenIndex);
        }
        items.push({
          type: "mcq", questionId: q.id, question: q.question, options: q.options || [],
          multiCorrect: q.multi_correct, correctIndices: [...correctSet],
          chosenIndex: a?.chosenIndex, chosenIndices: a?.chosenIndices || [],
          baseCorrect,
        });
      }
    }
    setReviewItems(items);
  };

  const setOverride = (questionId, value) => setOverrides((prev) => ({ ...prev, [questionId]: value }));

  const finalize = async () => {
    if (!open) return;
    setFinalizing(true);

    let correctCount = 0;
    const newAiReview = [];
    const newMcqOverrides = {};

    reviewItems.forEach((item) => {
      const decided = overrides[item.questionId] !== undefined ? overrides[item.questionId] : (item.type === "screenshot" ? item.aiCorrect : item.baseCorrect);
      if (decided) correctCount += 1;
      if (item.type === "screenshot") {
        newAiReview.push({ questionId: item.questionId, question: item.question, paths: item.paths, correct: item.aiCorrect, feedback: item.aiFeedback, adminOverride: overrides[item.questionId] !== undefined ? overrides[item.questionId] : null });
      } else if (overrides[item.questionId] !== undefined) {
        newMcqOverrides[item.questionId] = overrides[item.questionId];
      }
    });

    const total = reviewItems.length;
    const { data: quiz } = await supabase.from("quizzes").select("pass_percent").eq("id", open.quiz_id).single();
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = score >= (quiz?.pass_percent || 70);

    await supabase.from("quiz_attempts").update({
      status: "completed", score, passed, ai_review: newAiReview, mcq_overrides: newMcqOverrides,
      reviewed_at: new Date().toISOString(), reviewed_by: me.id,
    }).eq("id", open.id);

    setFinalizing(false);
    setOpen(null);
    load();
  };

  const exportExcel = () => {
    const header = ["Employee", "Team", "Assessment", "Score", "Passed", "Status", "Submitted"];
    const rows = visibleAttempts.map((a) => [
      (employees[a.user_id]?.full_name || "").replace(/,/g, " "),
      (employees[a.user_id]?.team || "").replace(/,/g, " "),
      (quizzes[a.quiz_id] || "Assessment").replace(/,/g, " "),
      a.score,
      a.passed ? "Yes" : "No",
      a.status,
      a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "",
    ].join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const teamPart = filterTeam !== "all" ? "-" + filterTeam.replace(/\s+/g, "_") : "";
    link.download = `assessment-scores${teamPart}.csv`;
    link.click();
  };

  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  const current = reviewItems[reviewIndex];

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <h1 className="page">Assessment review</h1>
        <p className="sub">Review any submission — screenshot answers the AI graded, or multiple-choice answers you want to double-check — and correct anything before finalizing a score.</p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <button className={`chipbtn ${tab === "pending" ? "on" : ""}`} onClick={() => setTab("pending")}>Pending review{pendingCount > 0 ? ` (${pendingCount})` : ""}</button>
          <button className={`chipbtn ${tab === "completed" ? "on" : ""}`} onClick={() => setTab("completed")}>Completed scores</button>
          <label className="field" style={{ maxWidth: 200, marginBottom: 0 }}>
            <span>Team</span>
            <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)}>
              <option value="all">All teams</option>
              {teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button className="btn outline" onClick={exportExcel} style={{ marginBottom: 0 }}>⬇ Export to Excel{filterTeam !== "all" ? ` (${filterTeam})` : ""}</button>
        </div>

        <div className="card">
          <table className="table">
            <thead><tr><th>Employee</th><th>Team</th><th>Assessment</th><th>Submitted</th><th>Score</th><th></th></tr></thead>
            <tbody>
              {visibleAttempts.length === 0 && <tr><td colSpan={6} className="mini" style={{ padding: 20 }}>{tab === "pending" ? "Nothing waiting on review right now." : "No completed assessments yet."}</td></tr>}
              {visibleAttempts.map((a) => (
                <tr key={a.id}>
                  <td><b>{employees[a.user_id]?.full_name || "—"}</b></td>
                  <td className="mini">{employees[a.user_id]?.team || "—"}</td>
                  <td>{quizzes[a.quiz_id] || "Assessment"}</td>
                  <td className="mini">{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</td>
                  <td><span className={`pill ${a.score >= 70 ? "red" : "gray"}`}>{a.score}%</span></td>
                  <td style={{ textAlign: "right" }}><button className="btn ghost" onClick={() => openAttempt(a)}>{tab === "pending" ? "Review" : "Review / Edit"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {open && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(17,22,26,.5)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }} onClick={() => setOpen(null)}>
            <div className="card pad scroll" style={{ width: 960, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <b>{employees[open.user_id]?.full_name} — {quizzes[open.quiz_id]}</b>
                <span style={{ cursor: "pointer", color: "#9aa0aa" }} onClick={() => setOpen(null)}>✕</span>
              </div>

              {reviewItems.length === 0 ? (
                <div className="mini" style={{ marginBottom: 14 }}>This assessment has no questions.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    {reviewItems.map((item, i) => {
                      const decided = overrides[item.questionId] !== undefined ? overrides[item.questionId] : (item.type === "screenshot" ? item.aiCorrect : item.baseCorrect);
                      return (
                        <button
                          key={i}
                          onClick={() => setReviewIndex(i)}
                          className="chipbtn"
                          style={{
                            width: 32, height: 32, padding: 0,
                            background: i === reviewIndex ? "#6d4aff" : decided ? "#e8f6ee" : "#fdeaec",
                            color: i === reviewIndex ? "#fff" : undefined,
                            borderColor: i === reviewIndex ? "#6d4aff" : undefined,
                          }}
                          title={item.type === "screenshot" ? "Screenshot question" : "Multiple choice"}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>

                  {current && (
                    <div className="tile" style={{ marginBottom: 16 }}>
                      <div className="mini" style={{ marginBottom: 4 }}>
                        Question {reviewIndex + 1} of {reviewItems.length} · {current.type === "screenshot" ? "📷 Screenshot" : "Multiple choice"}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{current.question}</div>

                      {current.type === "screenshot" ? (
                        <>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                            {current.paths.length === 0 && <div className="mini">No screenshot was submitted for this question.</div>}
                            {current.paths.map((url, pi) => (
                              <img key={pi} src={url} alt={`Submission ${pi + 1}`} style={{ maxWidth: 820, width: "100%", maxHeight: 700, objectFit: "contain", borderRadius: 10, border: "1px solid var(--line)" }} />
                            ))}
                          </div>
                          <div className="mini" style={{ marginBottom: 14, fontSize: 14 }}>
                            AI verdict: <b style={{ color: current.aiCorrect ? "#15803d" : "var(--red-dark)" }}>{current.aiCorrect ? "Correct" : "Incorrect"}</b> — {current.aiFeedback}
                          </div>
                        </>
                      ) : (
                        <div style={{ marginBottom: 14 }}>
                          {current.options.map((opt, oi) => {
                            const isCorrectOption = current.correctIndices.includes(oi);
                            const wasChosen = current.multiCorrect ? current.chosenIndices.includes(oi) : current.chosenIndex === oi;
                            return (
                              <div key={oi} style={{
                                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 6,
                                background: wasChosen ? "#eef1ff" : "transparent",
                                border: isCorrectOption ? "1px solid #15803d" : "1px solid var(--line)",
                              }}>
                                <span style={{ fontSize: 13 }}>
                                  {wasChosen ? "☑" : "☐"} {opt}
                                  {isCorrectOption && <span style={{ color: "#15803d", marginLeft: 8, fontWeight: 700 }}>✓ correct answer</span>}
                                  {wasChosen && !isCorrectOption && <span style={{ color: "var(--red-dark)", marginLeft: 8 }}>← employee's choice</span>}
                                </span>
                              </div>
                            );
                          })}
                          <div className="mini" style={{ marginTop: 6 }}>
                            System verdict: <b style={{ color: current.baseCorrect ? "#15803d" : "var(--red-dark)" }}>{current.baseCorrect ? "Correct" : "Incorrect"}</b>
                          </div>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8 }}>
                        <button className={`chipbtn ${(overrides[current.questionId] ?? (current.type === "screenshot" ? current.aiCorrect : current.baseCorrect)) === true ? "on" : ""}`} onClick={() => setOverride(current.questionId, true)}>Mark Correct</button>
                        <button className={`chipbtn ${(overrides[current.questionId] ?? (current.type === "screenshot" ? current.aiCorrect : current.baseCorrect)) === false ? "on" : ""}`} onClick={() => setOverride(current.questionId, false)}>Mark Incorrect</button>
                      </div>
                    </div>
                  )}

                  <div className="row-between" style={{ marginBottom: 16 }}>
                    <button className="btn outline" disabled={reviewIndex === 0} onClick={() => setReviewIndex(reviewIndex - 1)}>← Previous</button>
                    <button className="btn outline" disabled={reviewIndex === reviewItems.length - 1} onClick={() => setReviewIndex(reviewIndex + 1)}>Next →</button>
                  </div>
                </>
              )}

              <button className="btn primary full" disabled={finalizing} onClick={finalize}>
                {finalizing ? "Publishing…" : "Finalize & publish result"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
