// Deterministic parts of the ATS score and study-guide coverage. The AI judges each requirement and
// quotes its evidence; this code checks those claims against the real text and does all the maths,
// so the same inputs always give the same score and the AI cannot inflate it.

export type ReqStatus = "met" | "partial" | "missing";
export type Priority = "must" | "nice";

export interface CheckedRequirement {
  requirement: string;
  priority: Priority;
  status: ReqStatus;
  evidence: string; // verbatim from the resume, or "" when none was found
  downgraded: boolean; // the AI claimed more than the resume text supports
}

export const ATS_METHOD = 2;
export const MIN_JOB_DESCRIPTION = 200;
export const MIN_RESUME = 200;

// Lower-case, keep letters/digits and the symbols that matter in tech names (C++, C#, .NET, Node.js).
export const norm = (s: string) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s\.|\.\s/g, " ").replace(/\s+/g, " ").trim()} `;
const has = (haystack: string, needle: string) => {
  const n = norm(needle).trim();
  return n.length > 0 && haystack.includes(` ${n} `);
};

/** Keeps the AI's status only when its evidence quote really appears in the resume; otherwise one level lower. */
export function checkRequirements(raw: unknown, resumeText: string): CheckedRequirement[] {
  const resume = norm(resumeText);
  const seen = new Set<string>();
  const out: CheckedRequirement[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const requirement = String(r?.requirement || "").trim();
    const key = norm(requirement);
    if (!requirement || seen.has(key)) continue;
    seen.add(key);
    const priority: Priority = r?.priority === "nice" ? "nice" : "must";
    const claimed: ReqStatus = r?.status === "met" || r?.status === "partial" ? r.status : "missing";
    const quote = String(r?.evidence || "").trim();
    const verified = quote.split(/\s+/).length >= 2 && has(resume, quote);
    let status = claimed;
    if (claimed !== "missing" && !verified) status = claimed === "met" ? "partial" : "missing";
    out.push({ requirement, priority, status, evidence: verified ? quote : "", downgraded: status !== claimed });
  }
  return out.slice(0, 25);
}

/** Keywords count only if they are really in the job description; matched only if really in the resume. */
export function keywordCoverage(raw: unknown, jobDescription: string, resumeText: string) {
  const jd = norm(jobDescription), resume = norm(resumeText);
  const matched: string[] = [], missing: string[] = [];
  const seen = new Set<string>();
  for (const k of Array.isArray(raw) ? raw : []) {
    const kw = String(k || "").trim();
    const key = norm(kw);
    if (!kw || kw.length > 60 || seen.has(key) || !has(jd, kw)) continue;
    seen.add(key);
    (has(resume, kw) ? matched : missing).push(kw);
  }
  return { matched: matched.slice(0, 40), missing: missing.slice(0, 40) };
}

const WEIGHT: Record<Priority, number> = { must: 3, nice: 1 };
const CREDIT: Record<ReqStatus, number> = { met: 1, partial: 0.5, missing: 0 };

export function computeAtsScore(reqs: CheckedRequirement[], kw: { matched: string[]; missing: string[] }) {
  const max = reqs.reduce((a, r) => a + WEIGHT[r.priority], 0);
  const got = reqs.reduce((a, r) => a + WEIGHT[r.priority] * CREDIT[r.status], 0);
  const kwTotal = kw.matched.length + kw.missing.length;
  const requirementScore = max > 0 ? Math.round((got / max) * 100) : null;
  const keywordScore = kwTotal > 0 ? Math.round((kw.matched.length / kwTotal) * 100) : null;
  const score = requirementScore !== null && keywordScore !== null
    ? Math.round(requirementScore * 0.75 + keywordScore * 0.25)
    : requirementScore ?? keywordScore ?? 0;
  const must = reqs.filter((r) => r.priority === "must");
  return {
    score,
    verdict: score >= 80 ? "Strong Match" : score >= 65 ? "Good Match" : score >= 45 ? "Needs Work" : "Weak Match",
    breakdown: {
      requirementScore, keywordScore,
      requirementWeight: 75, keywordWeight: 25,
      mustMet: must.filter((r) => r.status === "met").length, mustPartial: must.filter((r) => r.status === "partial").length, mustTotal: must.length,
      keywordsMatched: kw.matched.length, keywordsTotal: kwTotal,
    },
  };
}

/** Which job requirements the study guide's modules cover. Module requirement strings that are not in the list are dropped. */
export function studyCoverage(modules: any[], requirements: string[]) {
  const byKey = new Map(requirements.map((r) => [norm(r), r]));
  const covered = new Set<string>();
  const cleaned = (Array.isArray(modules) ? modules : []).map((m) => {
    const reqs = (Array.isArray(m?.requirements) ? m.requirements : [])
      .map((r: unknown) => byKey.get(norm(String(r))))
      .filter((r: string | undefined): r is string => !!r);
    reqs.forEach((r: string) => covered.add(r));
    return { ...m, requirements: [...new Set(reqs)] };
  });
  return { modules: cleaned, covered: requirements.filter((r) => covered.has(r)), uncovered: requirements.filter((r) => !covered.has(r)) };
}
