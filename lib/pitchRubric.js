// Petpooja pitch evaluation rubric — the single source of truth used by the
// AI scorer (server) and by every report screen (browser).

export const RUBRIC_SECTIONS = [
  {
    name: "Operations Manager - Pitch",
    short: "OM Pitch",
    criteria: [
      "Clearly articulates the problem OM solves for the biller/outlet",
      "Connects features to outlet's specific pain points (not feature-dumping)",
      "Covers 3 step billing flow, OOW handling, and FCR Report value",
      "Establishes credibility/differentiator vs. current billing method",
      "Handles at least one objection before moving to demo",
    ],
  },
  {
    name: "Operations Manager - Demo",
    short: "OM Demo",
    criteria: [
      "Live walkthrough is smooth, no fumbling through screens",
      "Explains MP services correctly",
      "Demonstrates Captain App / QR-based ordering",
      "Covers Purchase Manager basics",
      "Ties each screen back to a business outcome, not just 'here's the button'",
    ],
  },
  {
    name: "Marketing Manager - Pitch & Demo",
    short: "Marketing",
    criteria: [
      "Pitch opens with a relevant use case (repeat customers, campaigns, retention)",
      "Clearly explains ROI/value framing, not just feature list",
      "Demo navigation is confident and error-free",
      "Connects Marketing Manager to outlet's existing marketing pain points",
      "Handles pricing/value pushback smoothly",
      "Demo sequence follows a logical story (not screen-hopping)",
    ],
  },
  {
    name: "Payroll & Task - Pitch & Demo",
    short: "Payroll & Task",
    criteria: [
      "Pitch identifies a real staffing/task-tracking pain point",
      "Clear differentiation from manual/Excel-based tracking",
      "Demo covers payroll setup flow end-to-end",
      "Demo covers task assignment/tracking flow",
      "Links both modules back to owner's operational visibility need",
      "Objection handling on adoption/change resistance",
    ],
  },
  {
    name: "Rapport Building",
    short: "Rapport",
    criteria: [
      "Opens with genuine rapport, not scripted small talk",
      "Active listening - references what the prospect said earlier",
      "Tone and pacing match the prospect's energy",
      "Maintains composure under pushback",
    ],
  },
  {
    name: "Closure",
    short: "Closure",
    criteria: [
      "Summarizes value discussed before asking for next step",
      "Clear, confident ask (not vague 'let me know')",
      "Secures a specific next action/commitment",
      "Handles closing objection without losing control of the call",
    ],
  },
];

export const RUBRIC_SECTION_NAMES = RUBRIC_SECTIONS.map((s) => s.name);
export const RUBRIC_SHORT_LABELS = RUBRIC_SECTIONS.reduce((acc, s) => { acc[s.name] = s.short; return acc; }, {});

// Marketplace services the rep should cover — ticking at least 5 is the target.
export const MARKETPLACE_SERVICES = [
  "KDS", "Captain App", "QR-Based Ordering", "OOR", "Feedback Management", "Token Management", "My Website",
];
export const SERVICES_TARGET = 5;
export const SERVICES_SECTION = "Operations Manager - Demo"; // where the services checklist is stored

// Marks per judgement. "na" criteria are left out of the maths entirely
// (the "marks / applicable" idea in the rubric).
export const STATUS_MARKS = { met: 1, partial: 0.5, not_met: 0 };

export function normalizeStatus(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["met", "yes", "true", "pass", "passed", "done", "1"].indexOf(s) !== -1) return "met";
  if (["partial", "partially", "partially_met", "half"].indexOf(s) !== -1) return "partial";
  if (["not_met", "notmet", "no", "false", "fail", "failed", "missed", "0"].indexOf(s) !== -1) return "not_met";
  return "na";
}

function looseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") { const s = v.trim().toLowerCase(); return s === "true" || s === "yes" || s === "1"; }
  return !!v;
}

// Turns the AI's raw "sections" answer into clean, fully-computed results.
// Always returns one entry per rubric section, in rubric order.
export function buildSectionResults(aiSections) {
  return RUBRIC_SECTIONS.map((section) => {
    const ai = (aiSections && aiSections[section.name]) || {};
    const aiCriteria = Array.isArray(ai.criteria) ? ai.criteria : [];
    const criteria = section.criteria.map((text, i) => {
      const c = aiCriteria[i] || {};
      return { text, status: normalizeStatus(c.status), evidence: String(c.evidence || "").slice(0, 200) };
    });
    let marks = 0;
    let applicable = 0;
    criteria.forEach((c) => {
      if (c.status !== "na") { applicable += 1; marks += STATUS_MARKS[c.status]; }
    });
    return {
      name: section.name,
      criteria,
      marks,
      applicable,
      score: applicable > 0 ? Math.round((marks / applicable) * 100) : null,
      comment: String(ai.comment || "").slice(0, 300),
    };
  });
}

// Overall = all marks earned ÷ all applicable criteria, across every section.
export function computeOverall(sectionResults) {
  let marks = 0;
  let applicable = 0;
  sectionResults.forEach((s) => { marks += s.marks; applicable += s.applicable; });
  return applicable > 0 ? Math.round((marks / applicable) * 100) : 0;
}

export function rubricIsUsable(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  return buildSectionResults(parsed.sections).some((s) => s.applicable > 0);
}

export function buildServices(aiServices) {
  const list = Array.isArray(aiServices) ? aiServices : [];
  return MARKETPLACE_SERVICES.map((name) => {
    const found = list.find((s) => s && String(s.service || "").trim().toLowerCase() === name.toLowerCase());
    return { service: name, covered: found ? looseBool(found.covered) : false };
  });
}

// ---- helpers for building the AI prompt ----
export function rubricPromptText() {
  return RUBRIC_SECTIONS.map((s) => {
    const lines = s.criteria.map((c, i) => "  " + (i + 1) + ". " + c).join("\n");
    return "SECTION \"" + s.name + "\" (" + s.criteria.length + " criteria, in this exact order):\n" + lines;
  }).join("\n\n");
}

export function sectionsSchemaExample() {
  const out = {};
  RUBRIC_SECTIONS.forEach((s) => {
    out[s.name] = {
      criteria: s.criteria.map(() => ({ status: "met | partial | not_met | na", evidence: "10 words or fewer, from the transcript" })),
      comment: "one short sentence on this section",
    };
  });
  return out;
}

export function servicesSchemaExample() {
  return MARKETPLACE_SERVICES.map((name) => ({ service: name, covered: false }));
}
