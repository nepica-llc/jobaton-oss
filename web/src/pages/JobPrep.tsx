import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ScanSearch, FileText, Mail, MessageSquare, Loader2, Copy, Sparkles, Check, X, Download, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const MOTIVATIONAL_QUOTES = [
  "The future belongs to those who believe in the beauty of their dreams. — Eleanor Roosevelt",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. — Winston Churchill",
  "Your time is limited, don't waste it living someone else's life. — Steve Jobs",
  "The only way to do great work is to love what you do. — Steve Jobs",
  "Believe you can and you're halfway there. — Theodore Roosevelt",
  "It always seems impossible until it's done. — Nelson Mandela",
  "The best way to predict the future is to create it. — Peter Drucker",
  "Don't watch the clock; do what it does. Keep going. — Sam Levenson",
  "Opportunities don't happen. You create them. — Chris Grosser",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Dream big. Start small. Act now. — Robin Sharma",
  "Every expert was once a beginner. — Helen Hayes",
];

function getRandomQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}

const LOADING_MESSAGES: Record<string, string> = {
  ats: "Analyzing your resume against the job description...",
  tailor: "Tailoring your resume for maximum impact...",
  "cover-letter": "Crafting your personalized cover letter...",
  "study-guide": "Building your personalized study guide...",
  interview: "Preparing your interview questions...",
};

const TABS = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "ats", label: "ATS Score", icon: ScanSearch },
  { key: "tailor", label: "Tailor Resume", icon: Sparkles },
  { key: "cover-letter", label: "Cover Letter", icon: Mail },
  { key: "study-guide", label: "Study Guide", icon: BookOpen },
  { key: "interview", label: "Interview Prep", icon: MessageSquare },
];

export default function JobPrep() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<any>(null);
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Persisted results (saved in job.prep_data)
  const [atsResult, setAtsResult] = useState<any>(null);
  const [tailorResult, setTailorResult] = useState<any>(null);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<number[]>([]);
  const [coverLetterResult, setCoverLetterResult] = useState("");
  const [interviewResult, setInterviewResult] = useState<any>(null);
  const [studyGuideResult, setStudyGuideResult] = useState<any>(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(getRandomQuote());

  useEffect(() => {
    Promise.all([api.getJob(id!), api.getResumes()])
      .then(([jobData, resumeData]) => {
        setJob(jobData);
        setResumes(resumeData || []);
        if (resumeData?.length > 0) setSelectedResumeId(resumeData[0].id);
        // Load persisted prep data
        if (jobData.prep_data) {
          const p = jobData.prep_data;
          if (p.ats) setAtsResult(p.ats);
          if (p.tailor) setTailorResult(p.tailor);
          if (p.accepted_suggestions) setAcceptedSuggestions(p.accepted_suggestions);
          if (p.cover_letter) setCoverLetterResult(p.cover_letter);
          if (p.interview) setInterviewResult(p.interview);
          if (p.study_guide) setStudyGuideResult(p.study_guide);
          if (p.resume_id) setSelectedResumeId(p.resume_id);
        }
      })
      .catch(() => navigate("/jobs"))
      .finally(() => setLoading(false));
  }, [id]);

  // Save prep data to job whenever results change
  const persistPrep = useCallback(async (updates: Record<string, any>) => {
    if (!job) return;
    const prep_data = { ...(job.prep_data || {}), ...updates, resume_id: selectedResumeId };
    const updated = { ...job, prep_data };
    setJob(updated);
    try { await api.updateJob(id!, updated); } catch { /* silent */ }
  }, [job, id, selectedResumeId]);

  const getResumeText = () => {
    const resume = resumes.find((r) => r.id === selectedResumeId);
    if (!resume) return "";
    const parts: string[] = [];
    if (resume.fullName) parts.push(`${resume.fullName} | ${resume.email || ""} | ${resume.phone || ""} | ${resume.location || ""}`);
    if (resume.summary) parts.push(`SUMMARY: ${resume.summary}`);
    if (resume.experience?.length) {
      parts.push("EXPERIENCE:");
      resume.experience.forEach((exp: any) => {
        parts.push(`${exp.title} at ${exp.company} (${exp.startDate || ""} - ${exp.endDate || ""})`);
        exp.bullets?.forEach((b: string) => parts.push(`  - ${b}`));
      });
    }
    if (resume.skills?.length) parts.push(`SKILLS: ${resume.skills.join(", ")}`);
    return parts.join("\n");
  };

  const startLoading = (tab: string) => { setTabLoading(true); setLoadingTab(tab); setLoadingQuote(getRandomQuote()); };
  const stopLoading = () => { setTabLoading(false); setLoadingTab(null); };

  const runATS = async () => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    startLoading("ats");
    try {
      const result = await api.atsScore(getResumeText(), job.raw_description || "");
      setAtsResult(result);
      await persistPrep({ ats: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const runTailor = async () => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    startLoading("tailor");
    try {
      const result = await api.tailorResume(getResumeText(), job.raw_description || "");
      setTailorResult(result);
      setAcceptedSuggestions([]);
      await persistPrep({ tailor: result, accepted_suggestions: [] });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const handleAcceptSuggestion = async (idx: number) => {
    const next = [...acceptedSuggestions, idx];
    setAcceptedSuggestions(next);
    await persistPrep({ accepted_suggestions: next });
  };

  const handleRejectSuggestion = async (idx: number) => {
    const next = acceptedSuggestions.filter((i) => i !== idx);
    setAcceptedSuggestions(next);
    await persistPrep({ accepted_suggestions: next });
  };

  const runCoverLetter = async () => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    startLoading("cover-letter");
    try {
      const result = await api.coverLetter(getResumeText(), job.raw_description || "", "professional");
      const text = result.coverLetter || result;
      setCoverLetterResult(text);
      await persistPrep({ cover_letter: text });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const runStudyGuide = async () => {
    startLoading("study-guide");
    try {
      const result = await api.studyGuide(job.title || "", job.company || "", job.raw_description || "");
      setStudyGuideResult(result);
      await persistPrep({ study_guide: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const runInterviewPrep = async () => {
    startLoading("interview");
    try {
      const result = await api.interviewPrep(job.title || "", job.company || "", job.raw_description || "");
      setInterviewResult(result);
      await persistPrep({ interview: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!job) return null;

  return (
    <div className="animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link to="/jobs" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-sm text-gray-500">{job.company}{job.location ? ` · ${job.location}` : ""}{job.salary ? ` · ${job.salary}` : ""}</p>
        </div>
      </div>

      {/* Resume selector */}
      <div className="bg-[#1a1a1a] rounded-lg border border-white/10 px-4 py-2 mb-4 flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Resume:</span>
        <select
          value={selectedResumeId}
          onChange={(e) => setSelectedResumeId(e.target.value)}
          className="text-sm border-0 bg-transparent focus:outline-none focus:ring-0 font-medium text-gray-700"
        >
          {resumes.length === 0 && <option value="">No resumes saved</option>}
          {resumes.map((r) => <option key={r.id} value={r.id}>{r.name || r.fullName || "Untitled"}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-white/10 pb-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key ? "border-[#028FA2] text-[#028FA2]" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5 min-h-[300px]">
        {activeTab === "overview" && <OverviewTab job={job} />}
        {activeTab === "ats" && <ATSTab result={atsResult} loading={tabLoading} onRun={runATS} />}
        {activeTab === "tailor" && (
          <TailorTab
            result={tailorResult}
            loading={tabLoading}
            onRun={runTailor}
            acceptedSuggestions={[]}
            onAccept={() => {}}
            onReject={() => {}}
            atsScore={atsResult?.score}
            getResumeText={getResumeText}
            jobDescription={job.raw_description || ""}
          />
        )}
        {activeTab === "cover-letter" && <CoverLetterTab result={coverLetterResult} loading={tabLoading} onRun={runCoverLetter} />}
        {activeTab === "study-guide" && <StudyGuideTab result={studyGuideResult} loading={tabLoading} onRun={runStudyGuide} jobTitle={job.title || ""} jobDescription={job.raw_description || ""} />}
        {activeTab === "interview" && <InterviewTab result={interviewResult} loading={tabLoading} onRun={runInterviewPrep} jobTitle={job.title || ""} jobDescription={job.raw_description || ""} />}
      </div>

      {/* ─── Full-screen AI Processing Overlay ─── */}
      {tabLoading && loadingTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] rounded-lg shadow-2xl max-w-md w-full mx-4 p-8 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-white/[0.06]" />
              <div className="absolute inset-0 rounded-full border-4 border-[#028FA2] border-t-transparent animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-[#028FA2]" />
            </div>
            <h3 className="text-lg font-semibold text-white">{LOADING_MESSAGES[loadingTab] || "Processing..."}</h3>
            <div className="w-full bg-gray-100 rounded-full h-2 mt-4">
              <div className="bg-[#028FA2] h-2 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>
            <p className="text-xs text-[#555] mt-2">Please wait, do not navigate away</p>
            <p className="text-xs text-[#888] italic mt-4 px-4 leading-relaxed">"{loadingQuote}"</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab({ job }: { job: any }) {
  return (
    <div className="space-y-4">
      {job.description_summary && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Summary</h3>
          <p className="text-sm text-gray-700">{job.description_summary}</p>
        </div>
      )}
      {job.requirements?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Requirements</h3>
          <ul className="space-y-1">
            {job.requirements.map((r: string, i: number) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 bg-[#028FA2] rounded-full shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.nice_to_have?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Nice to Have</h3>
          <ul className="space-y-1">
            {job.nice_to_have.map((r: string, i: number) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 bg-gray-300 rounded-full shrink-0" />{r}
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.raw_description && (
        <details className="mt-4">
          <summary className="text-xs font-semibold text-gray-500 uppercase cursor-pointer">Full Job Description</summary>
          <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap font-sans bg-white/[0.04] p-3 rounded-lg max-h-64 overflow-y-auto">{job.raw_description}</pre>
        </details>
      )}
    </div>
  );
}

// ─── ATS Tab ─────────────────────────────────────────────────────────────────
function ATSTab({ result, loading, onRun }: { result: any; loading: boolean; onRun: () => void }) {
  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <ScanSearch className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">Run ATS analysis against your selected resume</p>
        <button onClick={onRun} className="px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c]">Run ATS Scan</button>
      </div>
    );
  }
  if (loading) return <LoadingState text="Analyzing..." />;

  const score = result?.score || 0;
  const ringColor = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  const verdictColor = score >= 80 ? "text-green-400 bg-green-500/10 border-green-500/20" : score >= 60 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-red-400 bg-red-500/10 border-red-500/20";
  const sections = result?.sections || {};
  const sectionKeys = [
    { key: "summary", label: "Summary" },
    { key: "experience", label: "Experience" },
    { key: "skills", label: "Skills" },
    { key: "education", label: "Education" },
    { key: "formatting", label: "ATS Formatting" },
  ];

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="6" />
              <circle cx="40" cy="40" r="34" fill="none" stroke={ringColor} strokeWidth="6" strokeDasharray={`${(score / 100) * 213.6} 213.6`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white">{score}</span>
          </div>
          <div>
            <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-lg border ${verdictColor}`}>{result?.verdict || "Analyzed"}</span>
            <p className="text-sm text-[#888] mt-1.5 max-w-md leading-relaxed">{result?.summary}</p>
          </div>
        </div>
        <button onClick={onRun} className="text-xs text-[#028FA2] hover:underline shrink-0">Re-run</button>
      </div>

      {/* Section Breakdown */}
      <div>
        <h4 className="text-xs font-semibold text-white uppercase mb-3">Section Breakdown</h4>
        <div className="space-y-3">
          {sectionKeys.map(({ key, label }) => {
            const sec = sections[key];
            if (!sec) return null;
            const sScore = sec.score || 0;
            const sColor = sScore >= 80 ? "bg-green-500" : sScore >= 60 ? "bg-amber-500" : "bg-red-500";
            return (
              <details key={key} className="border border-white/10 rounded-xl overflow-hidden group">
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white text-xs font-bold ${sColor}`}>{sScore}</span>
                    <span className="text-sm font-medium text-white">{label}</span>
                  </div>
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full shrink-0">
                    <div className={`h-full rounded-full ${sColor}`} style={{ width: `${sScore}%` }} />
                  </div>
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] bg-white/[0.04]/50">
                  <p className="text-sm text-[#888] leading-relaxed">{sec.feedback}</p>
                  {sec.improvements?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {sec.improvements.map((imp: string, i: number) => (
                        <li key={i} className="text-xs text-[#888] flex items-start gap-2">
                          <ArrowRight className="h-3 w-3 text-[#028FA2] mt-0.5 shrink-0" />
                          <span>{imp}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Skill Gaps */}
      {result?.skillGaps?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-white uppercase mb-2">Skill Gaps</h4>
          <div className="space-y-2">
            {result.skillGaps.map((gap: any, i: number) => (
              <div key={i} className="border border-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">{gap.skill}</span>
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${gap.importance === "critical" ? "bg-red-100 text-red-700" : gap.importance === "important" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{gap.importance}</span>
                </div>
                <p className="text-xs text-[#888]">{gap.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result?.keywordMatches?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-white uppercase mb-2">Matched Keywords <span className="text-green-600">({result.keywordMatches.length})</span></h4>
            <div className="flex flex-wrap gap-1">{result.keywordMatches.map((k: string) => <span key={k} className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">{k}</span>)}</div>
          </div>
        )}
        {result?.missingKeywords?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-white uppercase mb-2">Missing Keywords <span className="text-red-600">({result.missingKeywords.length})</span></h4>
            <div className="flex flex-wrap gap-1">{result.missingKeywords.map((k: string) => <span key={k} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20">{k}</span>)}</div>
          </div>
        )}
      </div>

      {/* Strengths & Red Flags */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result?.strengths?.length > 0 && (
          <div className="border border-green-500/20 rounded-xl p-4 bg-green-500/[0.06]">
            <h4 className="text-xs font-semibold text-green-400 uppercase mb-2">Strengths</h4>
            <ul className="space-y-1">
              {result.strengths.map((s: string, i: number) => (
                <li key={i} className="text-xs text-green-700 flex items-start gap-2"><Check className="h-3 w-3 mt-0.5 shrink-0" /> {s}</li>
              ))}
            </ul>
          </div>
        )}
        {result?.redFlags?.length > 0 && (
          <div className="border border-red-500/20 rounded-xl p-4 bg-red-500/[0.06]">
            <h4 className="text-xs font-semibold text-red-400 uppercase mb-2">Potential Concerns</h4>
            <ul className="space-y-1">
              {result.redFlags.map((f: string, i: number) => (
                <li key={i} className="text-xs text-red-700 flex items-start gap-2"><X className="h-3 w-3 mt-0.5 shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {result?.suggestions?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-white uppercase mb-2">Actionable Improvements</h4>
          <div className="space-y-2">
            {result.suggestions.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 border border-white/10 rounded-xl bg-[#1a1a1a]">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#028FA2]/10 text-[10px] font-bold text-[#028FA2]">{i + 1}</span>
                <p className="text-sm text-[#888]">{s}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tailor Resume Tab ───────────────────────────────────────────────────────
function TailorTab({ result, loading, onRun }: {
  result: any; loading: boolean; onRun: () => void;
  acceptedSuggestions: number[]; onAccept: (i: number) => void; onReject: (i: number) => void;
  atsScore: number | undefined; getResumeText: () => string; jobDescription: string;
}) {
  const sections = result?.structured_sections || [];

  const buildResumeHTML = () => {
    let body = "";
    for (const sec of sections) {
      if (sec.type === "header") {
        const nameLine = sec.lines?.[0] || "";
        const contactLine = sec.lines?.slice(1).join(" | ") || "";
        body += `<div class="header"><h1>${nameLine}</h1>${contactLine ? `<p class="contact">${contactLine}</p>` : ""}</div>`;
      } else if (sec.entries?.length > 0) {
        body += `<h2>${sec.name}</h2>`;
        for (const entry of sec.entries) {
          body += `<div class="entry-header"><div class="entry-left"><span class="entry-title">${entry.title}</span>${entry.org ? ` <span class="entry-org">| ${entry.org}</span>` : ""}</div>`;
          body += `<div class="entry-right">${[entry.date, entry.location].filter(Boolean).join(" | ")}</div></div>`;
          if (entry.bullets?.length > 0) {
            body += `<ul>${entry.bullets.map((b: string) => `<li>${b}</li>`).join("")}</ul>`;
          }
        }
      } else if (sec.lines?.length > 0) {
        body += `<h2>${sec.name}</h2>`;
        for (const line of sec.lines) body += `<p>${line}</p>`;
      }
    }
    return body;
  };

  const resumeCSS = `@page{margin:0.5in 0.65in}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#1a1a1a;max-width:100%}
.header{text-align:center;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid #028FA2}
.header h1{font-size:18pt;font-weight:700;color:#0a2540;margin-bottom:2px}
.header .contact{font-size:9pt;color:#425466}
h2{font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#028FA2;border-bottom:1px solid #d1d5db;padding-bottom:2px;margin:12px 0 6px}
.entry-header{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 2px}
.entry-left{font-size:10.5pt}
.entry-title{font-weight:700;color:#0a2540}
.entry-org{color:#425466}
.entry-right{font-size:9pt;color:#6b7280;text-align:right;white-space:nowrap}
ul{padding-left:16px;margin:2px 0 6px}
li{font-size:10pt;margin:1px 0;list-style-type:disc;color:#1a1a1a}
p{margin:2px 0;font-size:10.5pt}
@media print{body{padding:0}h2{break-after:avoid}.entry-header{break-after:avoid}}`;

  const downloadPDF = () => {
    if (sections.length === 0 && !result?.tailored_resume) return;
    let htmlBody = "";
    if (sections.length > 0) {
      htmlBody = buildResumeHTML();
    } else {
      // Fallback to plain text parsing
      const lines = (result.tailored_resume || "").split("\n");
      for (const line of lines) {
        const t = line.trim();
        if (!t) { htmlBody += "<br/>"; continue; }
        if (/^[A-Z][A-Z\s&/,]{3,}$/.test(t)) htmlBody += `<h2>${t}</h2>`;
        else if (t.startsWith("- ") || t.startsWith("• ")) htmlBody += `<li>${t.replace(/^[-•]\s*/, "")}</li>`;
        else htmlBody += `<p>${t}</p>`;
      }
    }
    const html = `<!DOCTYPE html><html><head><title>Tailored Resume</title><style>${resumeCSS}</style></head><body>${htmlBody}</body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  };

  const copyToClipboard = () => {
    if (!result?.tailored_resume) return;
    navigator.clipboard.writeText(result.tailored_resume);
    toast.success("Resume copied to clipboard!");
  };

  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">AI will rewrite your resume tailored for this specific job</p>
        <button onClick={onRun} className="px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c]">Tailor My Resume</button>
      </div>
    );
  }
  if (loading) return <LoadingState text="Rewriting your resume for this role..." />;

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Tailored Resume</h3>
        <div className="flex items-center gap-2">
          <button onClick={copyToClipboard} className="glass-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md">
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button onClick={downloadPDF} className="glass-btn-primary flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md">
            <Download className="h-3 w-3" /> Download PDF
          </button>
          <button onClick={onRun} className="glass-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md">Re-generate</button>
        </div>
      </div>

      {/* Strategy */}
      {result?.strategy && (
        <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-lg">
          <p className="text-sm text-white"><strong>Approach:</strong> {result.strategy}</p>
        </div>
      )}

      {/* Changes + Keywords row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {result?.changes_summary?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-white uppercase mb-1.5">What Changed</h4>
            <ul className="space-y-0.5">
              {result.changes_summary.map((c: string, i: number) => (
                <li key={i} className="text-xs text-[#888] flex items-start gap-1.5">
                  <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" /> {c}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result?.keywords_added?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-white uppercase mb-1.5">Keywords Incorporated</h4>
            <div className="flex flex-wrap gap-1">{result.keywords_added.map((k: string) => <span key={k} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">{k}</span>)}</div>
          </div>
        )}
      </div>

      {/* Structured resume preview */}
      <div className="border border-white/10 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-white/[0.04] px-4 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#888] uppercase">Resume Preview</span>
          <span className="text-[10px] text-[#555]">Click "Download PDF" to save</span>
        </div>
        <div className="bg-[#1a1a1a] px-10 py-8 max-h-[650px] overflow-y-auto">
          {sections.length > 0 ? (
            <div className="space-y-0">
              {sections.map((sec: any, si: number) => {
                if (sec.type === "header") {
                  return (
                    <div key={si} className="text-center pb-3 mb-3 border-b-2 border-[#028FA2]">
                      <h1 className="text-xl font-bold text-white">{sec.lines?.[0]}</h1>
                      {sec.lines?.slice(1).map((l: string, li: number) => (
                        <p key={li} className="text-[10px] text-[#888] mt-0.5">{l}</p>
                      ))}
                    </div>
                  );
                }
                if (sec.entries?.length > 0) {
                  return (
                    <div key={si} className="mt-3">
                      <h2 className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#028FA2] border-b border-white/10 pb-1 mb-2">{sec.name}</h2>
                      {sec.entries.map((entry: any, ei: number) => (
                        <div key={ei} className="mb-2.5">
                          <div className="flex items-baseline justify-between gap-2">
                            <div>
                              <span className="text-sm font-bold text-white">{entry.title}</span>
                              {entry.org && <span className="text-sm text-[#888]"> | {entry.org}</span>}
                            </div>
                            <span className="text-[10px] text-[#555] whitespace-nowrap">{[entry.date, entry.location].filter(Boolean).join(" | ")}</span>
                          </div>
                          {entry.bullets?.length > 0 && (
                            <ul className="mt-0.5 ml-4 space-y-0">
                              {entry.bullets.map((b: string, bi: number) => (
                                <li key={bi} className="text-[11px] text-[#1a1a1a] list-disc leading-relaxed">{b}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }
                if (sec.lines?.length > 0) {
                  return (
                    <div key={si} className="mt-3">
                      <h2 className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#028FA2] border-b border-white/10 pb-1 mb-2">{sec.name}</h2>
                      {sec.lines.map((l: string, li: number) => (
                        <p key={li} className="text-[11px] text-[#1a1a1a] leading-relaxed">{l}</p>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          ) : result?.tailored_resume ? (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{result.tailored_resume}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Cover Letter Tab ────────────────────────────────────────────────────────
function CoverLetterTab({ result, loading, onRun }: { result: string; loading: boolean; onRun: () => void }) {
  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <Mail className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">Generate a cover letter tailored to this job</p>
        <button onClick={onRun} className="px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c]">Generate Cover Letter</button>
      </div>
    );
  }
  if (loading) return <LoadingState text="Writing..." />;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Generated Cover Letter</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => { navigator.clipboard.writeText(result); toast.success("Copied!"); }} className="glass-btn flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md">
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
          <button onClick={onRun} className="glass-btn flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md">Re-generate</button>
        </div>
      </div>
      <div className="whitespace-pre-wrap text-sm text-[#a1a1aa] bg-white/[0.02] border border-white/[0.06] rounded-lg p-5 max-h-[500px] overflow-y-auto leading-relaxed">{result}</div>
    </div>
  );
}

// ─── Study Guide Tab (Training System — ported from paid webapp) ─────────────
interface TrainingModule {
  skill: string;
  title: string;
  description: string;
  lessons: Lesson[];
}
interface Lesson {
  title: string;
  description: string;
  type: "read" | "practice" | "quiz";
  duration: string;
  completed: boolean;
  generating?: boolean;
  sections?: { heading: string; body: string; codeSnippet?: string }[];
  keyPoints?: string[];
  practicePrompt?: string;
  quiz?: { question: string; options: string[]; correctIndex: number }[];
}

const LESSON_TEMPLATES = [
  { title: "Core Concepts", type: "read" as const, duration: "20 min" },
  { title: "Hands-on Practice", type: "practice" as const, duration: "30 min" },
  { title: "Real-World Patterns", type: "read" as const, duration: "20 min" },
  { title: "Guided Exercise", type: "practice" as const, duration: "30 min" },
  { title: "Knowledge Check", type: "quiz" as const, duration: "10 min" },
];

function buildModulesFromGuide(data: any): TrainingModule[] {
  const modules = (data?.modules || []).slice(0, 10).filter((m: any) => m?.title);
  return modules.map((mod: any) => ({
    skill: mod.title,
    title: mod.title,
    description: mod.description || "",
    lessons: LESSON_TEMPLATES.map((t) => ({
      ...t,
      description: `${t.title} for ${mod.title}`,
      completed: false,
    })),
  }));
}

function StudyGuideTab({ result, loading, onRun, jobTitle, jobDescription }: { result: any; loading: boolean; onRun: () => void; jobTitle?: string; jobDescription?: string }) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [openModuleIdx, setOpenModuleIdx] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ mod: number; lesson: number } | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [showPodcastModal, setShowPodcastModal] = useState(false);

  useEffect(() => {
    if (result) {
      const data = result?.content ? (() => { try { return JSON.parse(result.content); } catch { return result; } })() : result;
      setModules(buildModulesFromGuide(data));
    }
  }, [result]);

  const updateLessonState = useCallback((modIdx: number, lessonIdx: number, updates: Partial<Lesson>) => {
    setModules((prev) =>
      prev.map((m, mi) => mi !== modIdx ? m : { ...m, lessons: m.lessons.map((l, li) => li !== lessonIdx ? l : { ...l, ...updates }) })
    );
  }, []);

  const openLessonContent = useCallback(async (modIdx: number, lessonIdx: number) => {
    const mod = modules[modIdx];
    const lesson = mod?.lessons[lessonIdx];
    if (!lesson) return;
    if (lesson.sections && lesson.sections.length > 0) {
      setActiveLesson({ mod: modIdx, lesson: lessonIdx });
      return;
    }
    updateLessonState(modIdx, lessonIdx, { generating: true });
    try {
      const allTitles = mod.lessons.map((l) => l.title);
      const res = await api.generateLesson(mod.skill, jobTitle || "", "", lesson.title, lesson.type, allTitles);
      const content = res?.lesson || res?.data?.lesson || res;
      updateLessonState(modIdx, lessonIdx, {
        sections: content.sections || [],
        keyPoints: content.keyPoints || [],
        practicePrompt: content.practicePrompt || "",
        quiz: content.quiz || [],
        generating: false,
      });
      setActiveLesson({ mod: modIdx, lesson: lessonIdx });
    } catch (err: any) {
      toast.error(err.message || "Failed to generate lesson");
      updateLessonState(modIdx, lessonIdx, { generating: false });
    }
  }, [modules, jobTitle, updateLessonState]);

  const handleGenerateAll = useCallback(async () => {
    setGeneratingAll(true);
    const total = modules.reduce((a, m) => a + m.lessons.length, 0);
    setGenProgress({ done: 0, total });
    let done = 0;
    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi];
      for (let li = 0; li < mod.lessons.length; li++) {
        const lesson = mod.lessons[li];
        if (lesson.sections && lesson.sections.length > 0) { done++; setGenProgress({ done, total }); continue; }
        updateLessonState(mi, li, { generating: true });
        try {
          const allTitles = mod.lessons.map((l) => l.title);
          const res = await api.generateLesson(mod.skill, jobTitle || "", "", lesson.title, lesson.type, allTitles);
          const content = res?.lesson || res?.data?.lesson || res;
          updateLessonState(mi, li, { sections: content.sections || [], keyPoints: content.keyPoints || [], practicePrompt: content.practicePrompt || "", quiz: content.quiz || [], generating: false });
        } catch { updateLessonState(mi, li, { generating: false }); }
        done++;
        setGenProgress({ done, total });
      }
    }
    setGeneratingAll(false);
    toast.success("All training content generated!");
  }, [modules, jobTitle, updateLessonState]);

  const handleLessonComplete = useCallback(() => {
    if (!activeLesson) return;
    updateLessonState(activeLesson.mod, activeLesson.lesson, { completed: true });
  }, [activeLesson, updateLessonState]);

  const confirmOpenNotebookLM = () => {
    navigator.clipboard.writeText(jobDescription || "");
    toast.success("Job requirements copied! Paste as a source in NotebookLM.");
    setShowPodcastModal(false);
    window.open("https://notebooklm.google.com/", "_blank");
  };

  // ─── EMPTY state ───
  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">Generate interactive training modules based on job requirements</p>
        <button onClick={onRun} className="px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c]">Generate Study Guide</button>
      </div>
    );
  }
  if (loading) return <LoadingState text="Building your study guide..." />;

  const totalLessons = modules.reduce((a, m) => a + m.lessons.length, 0);
  const completedLessons = modules.reduce((a, m) => a + m.lessons.filter((l) => l.completed).length, 0);
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const trainingGenerated = modules.some((m) => m.lessons.some((l) => l.sections && l.sections.length > 0));

  // ─── LESSON PLAYER (full-screen overlay) ───
  if (activeLesson) {
    const mod = modules[activeLesson.mod];
    const lesson = mod?.lessons[activeLesson.lesson];
    if (lesson) {
      return (
        <LessonPlayerInline
          lesson={lesson}
          moduleTitle={mod.title}
          lessonIndex={activeLesson.lesson}
          totalLessons={mod.lessons.length}
          onClose={() => setActiveLesson(null)}
          onComplete={() => { handleLessonComplete(); setActiveLesson(null); }}
        />
      );
    }
  }

  // ─── MODULE MODAL ───
  if (openModuleIdx !== null) {
    const mod = modules[openModuleIdx];
    const completedCount = mod.lessons.filter((l) => l.completed).length;
    return (
      <div className="space-y-4">
        <button onClick={() => setOpenModuleIdx(null)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to modules
        </button>
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${completedCount === mod.lessons.length ? "bg-green-100 text-green-600" : "bg-[#028FA2]/10 text-[#028FA2]"}`}>
            {completedCount === mod.lessons.length ? <Check className="h-6 w-6" /> : <BookOpen className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#028FA2] font-bold">Module {openModuleIdx + 1}</p>
            <h3 className="text-lg font-bold text-white">{mod.title}</h3>
            <p className="text-xs text-gray-500">{mod.description}</p>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-[#028FA2] h-2 rounded-full transition-all" style={{ width: `${(completedCount / mod.lessons.length) * 100}%` }} />
        </div>
        <p className="text-xs text-gray-500">{completedCount} of {mod.lessons.length} lessons completed</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {mod.lessons.map((lesson, li) => {
            const hasContent = lesson.sections && lesson.sections.length > 0;
            return (
              <button
                key={li}
                onClick={() => openLessonContent(openModuleIdx, li)}
                disabled={lesson.generating}
                className={`relative text-left rounded-xl border-2 p-4 transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98] ${
                  lesson.completed ? "border-green-200 bg-green-50" : "border-white/10 hover:border-[#028FA2]/40"
                } ${lesson.generating ? "opacity-60 cursor-wait" : ""}`}
              >
                <div className="absolute -top-2 -left-1.5">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${lesson.completed ? "bg-green-500 text-white" : "bg-[#028FA2] text-white"}`}>
                    {lesson.completed ? "✓" : li + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    lesson.type === "read" ? "bg-[#028FA2]/10 text-[#028FA2]" : lesson.type === "practice" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"
                  }`}>{lesson.type}</span>
                  {hasContent && <span className="text-[9px] text-green-600 font-medium">✦ Ready</span>}
                </div>
                <h4 className={`text-sm font-semibold ${lesson.completed ? "line-through opacity-60" : ""}`}>{lesson.title}</h4>
                <p className="text-[10px] text-gray-500 mt-1">{lesson.duration}</p>
                {lesson.generating && <span className="text-[10px] text-[#028FA2] animate-pulse mt-1 block">Generating…</span>}
              </button>
            );
          })}
        </div>
        {completedCount < mod.lessons.length && (
          <button
            onClick={() => { setModules((prev) => prev.map((m, i) => i !== openModuleIdx ? m : { ...m, lessons: m.lessons.map((l) => ({ ...l, completed: true })) })); }}
            className="text-xs text-green-600 hover:text-green-700 font-medium"
          >
            ✓ Mark all complete
          </button>
        )}
      </div>
    );
  }

  // ─── MAIN VIEW: Module cards ───
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between sticky top-0 bg-[#1a1a1a] pb-2 z-10">
        <div>
          <h3 className="text-sm font-semibold text-white">Training Modules</h3>
          <p className="text-xs text-gray-500">{completedLessons}/{totalLessons} lessons · {modules.length} modules</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPodcastModal(true)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">
            🎙️ Podcast
          </button>
          <button onClick={onRun} className="text-xs text-[#028FA2] hover:underline">Re-generate</button>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Generate All button */}
      {!trainingGenerated && modules.length > 0 && (
        <div className="border border-[#028FA2]/20 rounded-xl p-4 bg-[#028FA2]/10/50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Generate All Training</h4>
              <p className="text-xs text-[#028FA2] mt-0.5">{modules.length} modules · {totalLessons} lessons. Generate all content so you can study offline.</p>
            </div>
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c] disabled:opacity-50 flex items-center gap-1.5"
            >
              {generatingAll ? <><Loader2 className="h-3 w-3 animate-spin" /> {genProgress.done}/{genProgress.total}</> : <><Sparkles className="h-3 w-3" /> Generate All</>}
            </button>
          </div>
          {generatingAll && (
            <div className="mt-2 w-full bg-[#028FA2]/10 rounded-full h-1.5">
              <div className="bg-[#028FA2] h-1.5 rounded-full transition-all" style={{ width: `${genProgress.total > 0 ? (genProgress.done / genProgress.total) * 100 : 0}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Module Cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {modules.map((mod, mi) => {
          const modCompleted = mod.lessons.filter((l) => l.completed).length;
          const modTotal = mod.lessons.length;
          const modProgress = Math.round((modCompleted / modTotal) * 100);
          const isModDone = modCompleted === modTotal;
          const anyGenerating = mod.lessons.some((l) => l.generating);
          return (
            <button
              key={mi}
              onClick={() => setOpenModuleIdx(mi)}
              className={`group relative text-left rounded-lg border-2 p-4 transition-all hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] ${isModDone ? "border-green-200 bg-green-50/50 opacity-80" : "border-white/10 hover:border-[#028FA2]/40"}`}
            >
              <div className="absolute -top-2 -right-2">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shadow-sm ${isModDone ? "bg-green-500 text-white" : "bg-[#028FA2] text-white"}`}>
                  {isModDone ? "✓" : mi + 1}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isModDone ? "bg-green-100 text-green-600" : "bg-[#028FA2]/10 text-[#028FA2]"}`}>
                  {anyGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : isModDone ? <Check className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-semibold ${isModDone ? "line-through" : ""}`}>{mod.title}</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{mod.description}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">{modCompleted}/{modTotal} lessons</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isModDone ? "bg-green-500" : "bg-[#028FA2]"}`} style={{ width: `${modProgress}%` }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* NotebookLM Podcast */}
      <div className="border border-purple-500/20 rounded-lg p-4 bg-purple-500/[0.06]">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🎙️</span>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-purple-300">Generate Audio Podcast</h4>
            <p className="text-xs text-purple-400/80 mt-0.5">Create an AI podcast about these job requirements via NotebookLM.</p>
            <button onClick={() => setShowPodcastModal(true)} className="glass-btn-primary mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
              🎙️ Open NotebookLM
            </button>
          </div>
        </div>
      </div>

      {/* Podcast Modal */}
      {showPodcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPodcastModal(false)}>
          <div className="bg-[#1a1a1a] rounded-lg shadow-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-4">
              <span className="text-4xl">🎙️</span>
              <h3 className="text-lg font-bold text-white mt-2">Generate Audio Podcast</h3>
            </div>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              Use Google NotebookLM to create an AI-generated podcast discussion about these job requirements. The job description will be copied to your clipboard — paste it as a source in NotebookLM and click <strong>"Generate Audio Overview"</strong>.
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPodcastModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={confirmOpenNotebookLM} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors">Copy & Open NotebookLM</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Lesson Player (inline) ──────────────────────────────────────────────────
function LessonPlayerInline({ lesson, moduleTitle, lessonIndex, totalLessons, onClose, onComplete }: {
  lesson: Lesson; moduleTitle: string; lessonIndex: number; totalLessons: number; onClose: () => void; onComplete: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const sections = lesson.sections || [];
  const quiz = lesson.quiz || [];
  const hasPractice = !!lesson.practicePrompt;
  const hasQuiz = quiz.length > 0;
  const totalSteps = sections.length + (hasPractice ? 1 : 0) + (hasQuiz ? 1 : 0) + 1;
  const isOnSection = currentStep < sections.length;
  const practiceStepIdx = sections.length;
  const quizStepIdx = sections.length + (hasPractice ? 1 : 0);
  const summaryStepIdx = totalSteps - 1;
  const isOnPractice = hasPractice && currentStep === practiceStepIdx;
  const isOnQuiz = hasQuiz && currentStep === quizStepIdx;
  const isOnSummary = currentStep === summaryStepIdx;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to module
        </button>
        <div className="text-center">
          <p className="text-[10px] text-[#555]">{moduleTitle} · Lesson {lessonIndex + 1}/{totalLessons}</p>
          <h3 className="text-sm font-semibold text-white">{lesson.title}</h3>
        </div>
        <div className="w-16" />
      </div>

      {/* Step progress bar */}
      <div className="flex items-center gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <button key={i} onClick={() => setCurrentStep(i)} className={`h-2 flex-1 rounded-full transition-all cursor-pointer ${i < currentStep ? "bg-[#028FA2]" : i === currentStep ? "bg-[#028FA2] scale-y-125 shadow" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-[10px] text-gray-400">Step {currentStep + 1} of {totalSteps} · {Math.round(((currentStep + 1) / totalSteps) * 100)}%</p>

      {/* Content */}
      <div className="min-h-[300px]">
        {isOnSection && sections[currentStep] && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-[#028FA2]/[0.06] p-4 rounded-xl border-l-4 border-[#028FA2]">
              <p className="text-[10px] uppercase tracking-wider text-[#028FA2] font-bold">Scene {currentStep + 1} of {sections.length}</p>
              <h4 className="text-lg font-bold text-white mt-1">{sections[currentStep].heading}</h4>
            </div>
            {sections[currentStep].body.split("\n\n").map((p, pi) => (
              <p key={pi} className="text-sm text-gray-700 leading-relaxed">{p}</p>
            ))}
            {sections[currentStep].codeSnippet && (
              <div className="rounded-xl bg-gray-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                  <span className="text-[10px] text-gray-400 font-mono uppercase">Code Example</span>
                  <button onClick={() => { navigator.clipboard.writeText(sections[currentStep].codeSnippet || ""); toast.success("Copied!"); }} className="text-[10px] text-[#028FA2]/70 hover:text-[#028FA2]/70 font-bold">Copy</button>
                </div>
                <pre className="p-4 text-xs font-mono text-gray-200 whitespace-pre-wrap overflow-x-auto">{sections[currentStep].codeSnippet}</pre>
              </div>
            )}
            {lesson.keyPoints?.[currentStep] && (
              <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-lg flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-[#028FA2] mt-0.5 shrink-0" />
                <p className="text-xs text-white font-medium">{lesson.keyPoints[currentStep]}</p>
              </div>
            )}
          </div>
        )}

        {isOnPractice && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-purple-500/[0.06] p-4 rounded-xl border-l-4 border-purple-400">
              <p className="text-[10px] uppercase tracking-wider text-purple-400 font-bold">Hands-On</p>
              <h4 className="text-lg font-bold text-white mt-1">Practice Exercise</h4>
            </div>
            <div className="p-4 bg-purple-500/[0.06] border border-purple-500/20 rounded-xl">
              {lesson.practicePrompt?.split("\n\n").map((p, pi) => (
                <p key={pi} className="text-sm text-gray-700 leading-relaxed">{p}</p>
              ))}
            </div>
            <p className="text-xs text-gray-500">💡 Complete this exercise, then continue to validate with the quiz.</p>
          </div>
        )}

        {isOnQuiz && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-amber-500/[0.06] p-4 rounded-xl border-l-4 border-amber-400">
              <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">Knowledge Check</p>
              <h4 className="text-lg font-bold text-white mt-1">Quiz</h4>
            </div>
            {quiz.map((q, qi) => (
              <div key={qi} className="space-y-2 border border-white/10 rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-800">{qi + 1}. {q.question}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => {
                    const selected = quizAnswers[qi] === oi;
                    const isCorrect = oi === q.correctIndex;
                    let cls = "border-white/10 hover:border-[#028FA2]/40 hover:bg-[#028FA2]/10";
                    if (quizSubmitted && isCorrect) cls = "border-green-400 bg-green-50";
                    else if (quizSubmitted && selected && !isCorrect) cls = "border-red-400 bg-red-50";
                    else if (!quizSubmitted && selected) cls = "border-[#028FA2]/60 bg-[#028FA2]/10";
                    return (
                      <button key={oi} onClick={() => !quizSubmitted && setQuizAnswers((p) => ({ ...p, [qi]: oi }))} className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all text-xs ${cls}`}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[9px] font-bold">{String.fromCharCode(65 + oi)}</span>
                        <span>{opt}</span>
                        {quizSubmitted && isCorrect && <Check className="h-3.5 w-3.5 text-green-500 ml-auto" />}
                        {quizSubmitted && selected && !isCorrect && <X className="h-3.5 w-3.5 text-red-500 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!quizSubmitted && quiz.length > 0 && (
              <button onClick={() => setQuizSubmitted(true)} disabled={Object.keys(quizAnswers).length < quiz.length} className="w-full py-2.5 text-xs font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 transition-colors">
                Check Answers
              </button>
            )}
            {quizSubmitted && (
              <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-lg text-center">
                <p className="text-sm font-bold">{Object.entries(quizAnswers).filter(([qi, ai]) => quiz[Number(qi)]?.correctIndex === ai).length}/{quiz.length} correct</p>
              </div>
            )}
          </div>
        )}

        {isOnSummary && (
          <div className="space-y-4 animate-fade-in text-center py-6">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-lg bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-white">Lesson Complete!</h3>
            <p className="text-sm text-gray-500">You've covered all {sections.length} scenes in "{lesson.title}".</p>
            {lesson.keyPoints && lesson.keyPoints.length > 0 && (
              <div className="text-left space-y-2 max-w-md mx-auto">
                <h5 className="text-xs font-bold text-gray-500 uppercase">Key Takeaways</h5>
                {lesson.keyPoints.map((kp, ki) => (
                  <div key={ki} className="flex items-start gap-2 p-2 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-lg">
                    <Check className="h-3.5 w-3.5 text-[#028FA2] mt-0.5 shrink-0" />
                    <span className="text-xs text-white">{kp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        <button onClick={() => setCurrentStep((p) => Math.max(0, p - 1))} disabled={currentStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-30">
          <ArrowLeft className="h-3 w-3" /> Previous
        </button>
        {currentStep === summaryStepIdx ? (
          <button onClick={onComplete} className="px-4 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Complete Lesson
          </button>
        ) : (
          <button onClick={() => setCurrentStep((p) => Math.min(totalSteps - 1, p + 1))} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c]">
            Next <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Interview Prep Tab — Timed Interview Zone ──────────────────────────────
function InterviewTab({ result, loading, onRun, jobTitle, jobDescription }: { result: any; loading: boolean; onRun: () => void; jobTitle?: string; jobDescription?: string }) {
  const [mode, setMode] = useState<"lobby" | "zone" | "review">("lobby");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [selectedRound, setSelectedRound] = useState<"all" | "easy" | "medium" | "hard">("all");
  const [showExplanation, setShowExplanation] = useState(false);

  // Parse questions from interview result
  const parseQuestions = useCallback(() => {
    if (!result) return { all: [] as any[], easy: [] as any[], medium: [] as any[], hard: [] as any[], overview: "", tips: [] as string[] };
    const data = result?.content ? (() => { try { return JSON.parse(result.content); } catch { return result; } })() : result;
    const easy: any[] = [];
    const medium: any[] = [];
    const hard: any[] = [];
    data?.rounds?.forEach((round: any) => {
      const diff = round.difficulty || (round.name?.toLowerCase()?.includes("easy") ? "easy" : round.name?.toLowerCase()?.includes("hard") ? "hard" : "medium");
      const defaultTime = diff === "easy" ? 120 : diff === "hard" ? 300 : 180;
      (round?.questions || []).forEach((q: any) => {
        if (!q.question) return;
        const opts = q.options?.map ? q.options.map((o: any) => typeof o === "string" ? { label: o, correct: false } : o) : [
          { label: q.sampleAnswer || "Best answer", correct: true },
          { label: "Not sure", correct: false },
          { label: "Irrelevant answer", correct: false },
          { label: "Partially correct", correct: false },
        ];
        // Ensure at least one correct
        if (!opts.some((o: any) => o.correct)) opts[0].correct = true;
        const entry = { question: q.question, options: opts, timeLimit: q.timeLimit || defaultTime, difficulty: diff, explanation: q.explanation || "" };
        if (diff === "easy") easy.push(entry);
        else if (diff === "hard") hard.push(entry);
        else medium.push(entry);
      });
    });
    return { all: [...easy, ...medium, ...hard], easy, medium, hard, overview: data?.overview || "", tips: data?.tips || [] };
  }, [result]);

  const parsed = parseQuestions();
  const questions = selectedRound === "all" ? parsed.all : parsed[selectedRound];

  // Timer per question
  useEffect(() => {
    if (mode !== "zone") return;
    setTimeLeft(questions[currentQ]?.timeLimit || 30);
    setShowExplanation(false);
  }, [currentQ, mode]);

  // Global timer
  useEffect(() => {
    if (mode !== "zone") return;
    const t = setInterval(() => setTotalTime((p) => p + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== "zone" || timeLeft <= 0) {
      if (timeLeft === 0 && mode === "zone" && answers[currentQ] === undefined) {
        // Auto-skip on timeout
        setAnswers((p) => ({ ...p, [currentQ]: -1 }));
        setShowExplanation(true);
      }
      return;
    }
    const t = setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, mode]);

  const handleSelect = (optIdx: number) => {
    if (answers[currentQ] !== undefined) return;
    setAnswers((p) => ({ ...p, [currentQ]: optIdx }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((p) => p + 1);
      setShowExplanation(false);
    } else {
      setMode("review");
    }
  };

  const startInterview = (round: "all" | "easy" | "medium" | "hard") => {
    setSelectedRound(round);
    setCurrentQ(0);
    setAnswers({});
    setTotalTime(0);
    setMode("zone");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (!result && !loading) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mb-3">Generate interview questions across multiple difficulty levels with a timed interview zone</p>
        <button onClick={onRun} className="px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c]">Generate Interview Prep</button>
      </div>
    );
  }
  if (loading) return <LoadingState text="Preparing interview questions..." />;

  // ─── REVIEW MODE ───
  if (mode === "review") {
    const correct = Object.entries(answers).filter(([qi, ai]) => {
      const q = questions[Number(qi)];
      return q?.options[Number(ai)]?.correct;
    }).length;
    const skipped = Object.entries(answers).filter(([, ai]) => Number(ai) === -1).length;
    const score = Math.round((correct / questions.length) * 100);
    const byDifficulty = (diff: string) => {
      const qs = questions.filter((q: any) => q.difficulty === diff);
      const indices = questions.map((q: any, i: number) => q.difficulty === diff ? i : -1).filter((i: number) => i >= 0);
      const c = indices.filter((i: number) => questions[i]?.options[answers[i]]?.correct).length;
      return { total: qs.length, correct: c };
    };

    return (
      <div className="space-y-5">
        <div className="text-center py-6 bg-[#028FA2]/[0.04] rounded-lg border border-[#028FA2]/20">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-lg bg-[#1a1a1a] shadow-lg mb-3">
            <Check className="h-8 w-8 text-[#028FA2]" />
          </div>
          <h3 className="text-xl font-bold text-white">Interview Complete!</h3>
          <p className="text-3xl font-bold text-[#028FA2] mt-2">{score}%</p>
          <p className="text-sm text-[#888] mt-1">{correct}/{questions.length} correct · {skipped} skipped · {formatTime(totalTime)} total</p>
        </div>

        {/* Breakdown by difficulty */}
        <div className="grid grid-cols-3 gap-3">
          {[{ d: "easy", label: "Easy", color: "text-green-600 bg-green-50 border-green-200" }, { d: "medium", label: "Medium", color: "text-amber-600 bg-amber-50 border-amber-200" }, { d: "hard", label: "Hard", color: "text-red-600 bg-red-50 border-red-200" }].map(({ d, label, color }) => {
            const s = byDifficulty(d);
            return (
              <div key={d} className={`p-4 rounded-xl border text-center ${color}`}>
                <p className="text-xs font-semibold uppercase">{label}</p>
                <p className="text-2xl font-bold mt-1">{s.correct}/{s.total}</p>
              </div>
            );
          })}
        </div>

        {/* Question review */}
        <details className="border border-white/10 rounded-xl">
          <summary className="px-4 py-3 text-sm font-semibold text-white cursor-pointer">Review Answers ({questions.length} questions)</summary>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {questions.map((q: any, i: number) => {
              const ans = answers[i];
              const isCorrect = ans >= 0 && q.options[ans]?.correct;
              const wasSkipped = ans === -1;
              return (
                <div key={i} className={`px-4 py-3 ${isCorrect ? "bg-green-50/50" : wasSkipped ? "bg-white/[0.04]" : "bg-red-50/50"}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${isCorrect ? "bg-green-500" : wasSkipped ? "bg-gray-400" : "bg-red-500"}`}>
                      {isCorrect ? "✓" : wasSkipped ? "—" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{q.question}</p>
                      <span className={`inline-block mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${q.difficulty === "easy" ? "bg-green-100 text-green-700" : q.difficulty === "hard" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{q.difficulty}</span>
                      {q.explanation && <p className="text-xs text-[#888] mt-1">{q.explanation}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        <div className="flex gap-3">
          <button onClick={() => { setMode("lobby"); setCurrentQ(0); setAnswers({}); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-[#888] bg-white/[0.04] border border-white/10 rounded-xl hover:bg-gray-100">Back to Lobby</button>
          <button onClick={() => startInterview(selectedRound)} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c]">Retake</button>
        </div>
      </div>
    );
  }

  // ─── INTERVIEW ZONE (fullscreen-like timed mode) ───
  if (mode === "zone" && questions.length > 0) {
    const q = questions[currentQ];
    const selected = answers[currentQ];
    const diffColor = q?.difficulty === "easy" ? "text-green-600" : q?.difficulty === "hard" ? "text-red-600" : "text-amber-600";
    const diffBg = q?.difficulty === "easy" ? "bg-green-50 border-green-200" : q?.difficulty === "hard" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";

    return (
      <div className="space-y-4">
        {/* Interview zone header bar */}
        <div className="flex items-center justify-between p-3 bg-[#0a2540] rounded-xl text-white">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${timeLeft > 10 ? "bg-green-400 animate-pulse" : "bg-red-400 animate-pulse"}`} />
            <span className="text-sm font-mono font-bold">{formatTime(timeLeft)}</span>
            <span className="text-[10px] text-gray-400 border-l border-gray-600 pl-3">Total: {formatTime(totalTime)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${diffBg} ${diffColor}`}>{q?.difficulty}</span>
            <span className="text-xs text-gray-300">Q{currentQ + 1}/{questions.length}</span>
          </div>
        </div>

        {/* Timer bar */}
        <div className="h-1.5 rounded-full bg-gray-800/20">
          <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft > 10 ? "bg-[#028FA2]" : "bg-red-500"}`} style={{ width: `${(timeLeft / (q?.timeLimit || 30)) * 100}%` }} />
        </div>

        {/* Question */}
        <div className="p-8 bg-white/[0.02] rounded-lg border border-white/10 text-center min-h-[140px] flex items-center justify-center">
          <h3 className="text-lg font-semibold text-white leading-relaxed">{q?.question}</h3>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {q?.options?.map((opt: any, oi: number) => {
            const isSelected = selected === oi;
            const isCorrect = opt.correct;
            const showResult = selected !== undefined;
            let cls = "border-white/10 hover:border-[#028FA2]/50 hover:bg-[#028FA2]/10";
            if (showResult && isSelected && isCorrect) cls = "border-green-400 bg-green-50 shadow-sm";
            if (showResult && isSelected && !isCorrect) cls = "border-red-400 bg-red-50 shadow-sm";
            if (showResult && !isSelected && isCorrect) cls = "border-green-300 bg-green-50/50";
            return (
              <button key={oi} onClick={() => handleSelect(oi)} disabled={selected !== undefined} className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all ${cls}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${showResult && isCorrect ? "bg-green-500 text-white" : showResult && isSelected && !isCorrect ? "bg-red-500 text-white" : "bg-gray-100 text-[#888]"}`}>
                  {showResult && isCorrect ? "✓" : showResult && isSelected && !isCorrect ? "✗" : String.fromCharCode(65 + oi)}
                </span>
                <span className="text-sm text-white">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Explanation after answering */}
        {showExplanation && q?.explanation && (
          <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-xl animate-fade-in">
            <p className="text-xs text-white"><strong>Explanation:</strong> {q.explanation}</p>
          </div>
        )}

        {/* Next button */}
        {selected !== undefined && (
          <div className="flex justify-end">
            <button onClick={handleNext} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] transition-colors">
              {currentQ < questions.length - 1 ? <>Next <ArrowRight className="h-3.5 w-3.5" /></> : <>Finish Interview <Check className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

        {/* Progress dots */}
        <div className="flex items-center gap-0.5">
          {questions.map((_: any, i: number) => {
            const a = answers[i];
            const done = a !== undefined;
            const correct = done && a >= 0 && questions[i]?.options[a]?.correct;
            return <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${done ? (correct ? "bg-green-500" : a === -1 ? "bg-gray-400" : "bg-red-400") : i === currentQ ? "bg-[#028FA2]" : "bg-gray-200"}`} />;
          })}
        </div>
      </div>
    );
  }

  // ─── LOBBY (pre-start) ───
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Interview Zone</h3>
        <button onClick={onRun} className="text-xs text-[#028FA2] hover:underline">Re-generate</button>
      </div>

      {parsed.overview && <p className="text-sm text-[#888]">{parsed.overview}</p>}

      {/* Question stats */}
      <div className="grid grid-cols-3 gap-3">
        {[{ round: "easy" as const, label: "Easy", desc: "2 min per question", color: "border-green-200 bg-green-50", iconColor: "text-green-600" },
          { round: "medium" as const, label: "Medium", desc: "3 min per question", color: "border-amber-200 bg-amber-50", iconColor: "text-amber-600" },
          { round: "hard" as const, label: "Hard", desc: "5 min per question", color: "border-red-200 bg-red-50", iconColor: "text-red-600" }
        ].map(({ round, label, desc, color, iconColor }) => (
          <div key={round} className={`p-4 rounded-xl border text-center ${color}`}>
            <p className={`text-xl font-bold ${iconColor}`}>{parsed[round].length}</p>
            <p className="text-xs font-semibold text-white">{label}</p>
            <p className="text-[10px] text-[#555] mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* Start buttons */}
      <div className="bg-[#028FA2]/[0.04] rounded-lg border border-[#028FA2]/20 p-6 text-center">
        <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-lg bg-[#1a1a1a] shadow-lg mb-3">
          <MessageSquare className="h-7 w-7 text-[#028FA2]" />
        </div>
        <h3 className="text-lg font-bold text-white">Enter Interview Zone</h3>
        <p className="text-sm text-[#888] mt-1 mb-4">Timed environment. Answer each question before time runs out. No going back.</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button onClick={() => startInterview("all")} className="px-5 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] transition-colors">
            All {parsed.all.length} Questions
          </button>
          <button onClick={() => startInterview("easy")} className="px-4 py-2.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
            Easy ({parsed.easy.length})
          </button>
          <button onClick={() => startInterview("medium")} className="px-4 py-2.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 transition-colors">
            Medium ({parsed.medium.length})
          </button>
          <button onClick={() => startInterview("hard")} className="px-4 py-2.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors">
            Hard ({parsed.hard.length})
          </button>
        </div>
      </div>

      {/* Tips */}
      {parsed.tips.length > 0 && (
        <div className="border border-white/[0.06] rounded-xl p-4">
          <h4 className="text-xs font-semibold text-white uppercase mb-2">Interview Tips</h4>
          <ul className="space-y-1">
            {parsed.tips.map((tip: string, i: number) => (
              <li key={i} className="text-xs text-[#888] flex items-start gap-2"><span className="text-[#028FA2] mt-0.5">•</span> {tip}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────
function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-[#028FA2]" />
      <span className="ml-2 text-sm text-gray-500">{text}</span>
    </div>
  );
}
