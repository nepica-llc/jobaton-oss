import { Check, Minus, X } from "lucide-react";

// How an ATS score was reached: the formula inputs and every requirement with the resume text that
// proves it. Shared by the job page and the standalone ATS page.
type Req = { requirement: string; priority: "must" | "nice"; status: "met" | "partial" | "missing"; evidence: string; downgraded: boolean };

export default function AtsChecklist({ result }: { result: any }) {
  const reqs: Req[] = Array.isArray(result?.requirements) ? result.requirements : [];
  const b = result?.breakdown;
  if (!b || reqs.length === 0) return null;
  const order = { missing: 0, partial: 1, met: 2 } as const;
  const sorted = [...reqs].sort((x, y) => (x.priority === y.priority ? 0 : x.priority === "must" ? -1 : 1) || order[x.status] - order[y.status]);
  const icon = { met: <Check className="h-3.5 w-3.5" />, partial: <Minus className="h-3.5 w-3.5" />, missing: <X className="h-3.5 w-3.5" /> };
  const color = { met: "#22c55e", partial: "#eab308", missing: "#ef4444" };

  return (
    <div className="space-y-4">
      <div className="border border-white/10 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-white uppercase mb-3">How this score is calculated</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-white"><span className="font-bold">{b.requirementScore ?? "n/a"}{b.requirementScore !== null ? "%" : ""}</span> requirements <span className="text-[#555]">({b.requirementWeight}% of score)</span></p>
            <p className="text-xs text-[#888] mt-0.5">{b.mustMet} of {b.mustTotal} must-haves met{b.mustPartial ? `, ${b.mustPartial} partly` : ""}. Must-haves count 3 times as much as nice-to-haves; partly met counts half.</p>
          </div>
          <div>
            <p className="text-sm text-white"><span className="font-bold">{b.keywordScore ?? "n/a"}{b.keywordScore !== null ? "%" : ""}</span> keywords <span className="text-[#555]">({b.keywordWeight}% of score)</span></p>
            <p className="text-xs text-[#888] mt-0.5">{b.keywordsMatched} of {b.keywordsTotal} key terms from the job description appear in your resume, matched as whole words.</p>
          </div>
        </div>
        <p className="text-[0.667rem] text-[#555] mt-3">The AI checks each requirement and must quote your resume as proof. Any quote that is not really in your resume is rejected and the requirement is marked lower, so the score cannot be inflated.</p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-white uppercase mb-2">Requirements checklist</h4>
        <ul className="space-y-1.5">
          {sorted.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5 border border-white/[0.06] rounded-lg p-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5" style={{ background: `${color[r.status]}22`, color: color[r.status] }} aria-label={r.status}>{icon[r.status]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-white">{r.requirement}</span>
                  <span className="text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: r.priority === "must" ? "rgba(2,143,162,0.15)" : "rgba(255,255,255,0.06)", color: r.priority === "must" ? "#2dd4bf" : "#a1a1aa" }}>
                    {r.priority === "must" ? "Must-have" : "Nice-to-have"}
                  </span>
                </div>
                {r.evidence
                  ? <p className="text-xs text-[#888] mt-1">Your resume: <q className="italic">{r.evidence}</q></p>
                  : <p className="text-xs text-[#555] mt-1">{r.downgraded ? "The AI claimed this, but the text it quoted is not in your resume, so it was not counted as met." : "Not found in your resume."}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
