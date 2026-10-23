import { RUBRIC_SECTION_NAMES, SERVICES_SECTION, SERVICES_TARGET } from "../lib/pitchRubric";

const STATUS = {
  met:     { icon: "✓", label: "Met",     color: "#15803d",         bg: "#e8f6ee" },
  partial: { icon: "◐", label: "Partial", color: "#b3740c",         bg: "#fff4e0" },
  not_met: { icon: "✕", label: "Not met", color: "var(--red-dark)", bg: "#fdeaec" },
  na:      { icon: "–", label: "N/A",     color: "var(--muted)",    bg: "var(--card-2)" },
};

function scoreStyle(score) {
  if (score == null) return { background: "var(--card-2)", color: "var(--muted)" };
  if (score >= 70) return { background: "#e8f6ee", color: "#15803d" };
  if (score >= 50) return { background: "#fff4e0", color: "#b3740c" };
  return { background: "#fdeaec", color: "var(--red-dark)" };
}

function fmtMarks(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Shows a call's evaluation. Calls scored on the Petpooja pitch rubric get the
// full criterion-by-criterion view; older calls (scored on the earlier skill
// list) keep showing exactly the tiles they always did.
export default function RubricReport({ report }) {
  const params = (report && report.parameter_scores) || {};
  const entries = Object.entries(params);
  const isRubric = entries.some(([, v]) => v && Array.isArray(v.criteria));

  if (!isRubric) {
    return (
      <div className="grid2">
        {entries.map(([name, v]) => (
          <div key={name} className="tile">
            <div className="row-between"><b style={{ fontSize: 13 }}>{name}</b><span className="pill red">{v.score}%</span></div>
            <div className="mini" style={{ marginTop: 6 }}>{v.comment}</div>
          </div>
        ))}
      </div>
    );
  }

  const ordered = RUBRIC_SECTION_NAMES.filter((n) => params[n]);

  return (
    <div>
      <div className="mini" style={{ marginBottom: 10 }}>
        Scored on the Petpooja pitch rubric. Criteria that didn't apply to this call are left out of the score, so nobody is marked down for something the call never needed.
      </div>

      {ordered.map((name) => {
        const sec = params[name];
        const notApplicable = sec.applicable === 0;
        const services = name === SERVICES_SECTION && Array.isArray(sec.services) ? sec.services : null;
        const covered = services ? services.filter((s) => s.covered).length : 0;
        const target = (sec.services_target) || SERVICES_TARGET;

        return (
          <div key={name} className="tile" style={{ marginBottom: 12 }}>
            <div className="row-between" style={{ gap: 10 }}>
              <b style={{ fontSize: 13.5 }}>{name}</b>
              <span className="pill" style={scoreStyle(sec.score)}>{notApplicable ? "Not applicable" : `${sec.score}%`}</span>
            </div>
            <div className="mini" style={{ marginTop: 4 }}>
              {notApplicable ? "This call didn't cover this area, so it isn't counted." : `${fmtMarks(sec.marks)} of ${sec.applicable} marks`}
              {sec.comment ? ` — ${sec.comment}` : ""}
            </div>

            <div style={{ marginTop: 8 }}>
              {(sec.criteria || []).map((c, i) => {
                const st = STATUS[c.status] || STATUS.na;
                return (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none", opacity: c.status === "na" ? 0.6 : 1 }}>
                    <span style={{ flex: "none", minWidth: 62, textAlign: "center", alignSelf: "flex-start", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: st.bg, color: st.color }}>
                      {st.icon} {st.label}
                    </span>
                    <div style={{ fontSize: 13 }}>
                      {c.text}
                      {c.evidence && <div className="mini" style={{ marginTop: 2 }}>{c.evidence}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {services && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed var(--line)" }}>
                <div className="row-between" style={{ gap: 10 }}>
                  <b style={{ fontSize: 12.5 }}>Marketplace services covered (target: {target})</b>
                  <span className="pill" style={covered >= target ? { background: "#e8f6ee", color: "#15803d" } : { background: "#fff4e0", color: "#b3740c" }}>
                    {covered} of {services.length}{covered >= target ? " · target met" : " · below target"}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {services.map((s) => (
                    <span key={s.service} style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: s.covered ? "#e8f6ee" : "var(--card-2)", color: s.covered ? "#15803d" : "var(--muted)" }}>
                      {s.covered ? "✓" : "○"} {s.service}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
