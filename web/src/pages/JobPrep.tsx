import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ScanSearch, FileText, Mail, MessageSquare, Loader2, Copy, Sparkles, Check, X, Download, BookOpen, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import LetterPaper from "@/components/LetterPaper";
import { downloadPDF as exportPDF, downloadWord, textToBlocks, safeFileName, type DocBlock } from "@/lib/exportDoc";

const MOTIVATIONAL_QUOTES = [
  "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
  "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
  "Your time is limited, don't waste it living someone else's life. - Steve Jobs",
  "The only way to do great work is to love what you do. - Steve Jobs",
  "Believe you can and you're halfway there. - Theodore Roosevelt",
  "It always seems impossible until it's done. - Nelson Mandela",
  "The best way to predict the future is to create it. - Peter Drucker",
  "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
  "Opportunities don't happen. You create them. - Chris Grosser",
  "The harder you work for something, the greater you'll feel when you achieve it.",
  "Dream big. Start small. Act now. - Robin Sharma",
  "Every expert was once a beginner. - Helen Hayes",
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

  // Save prep data to job whenever results change. Builds on the latest job (via ref) so
  // saves that finish out of order (e.g. company facts vs. a cover letter) don't drop each other.
  const jobRef = useRef<any>(null);
  jobRef.current = job;
  const persistPrep = useCallback(async (updates: Record<string, any>) => {
    const cur = jobRef.current;
    if (!cur) return;
    const prep_data = { ...(cur.prep_data || {}), ...updates, resume_id: selectedResumeId };
    const updated = { ...cur, prep_data };
    jobRef.current = updated;
    setJob(updated);
    try { await api.updateJob(id!, updated); } catch { /* silent */ }
  }, [id, selectedResumeId]);

  // Company facts: fetched once per job in the background, shown while AI work runs.
  const companyFacts: string[] = job?.prep_data?.company_facts?.company === job?.company ? job?.prep_data?.company_facts?.facts || [] : [];
  useEffect(() => {
    const cur = jobRef.current;
    if (!cur?.company || /^unknown$/i.test(cur.company) || cur.prep_data?.company_facts?.company === cur.company) return;
    api.companyFacts(cur.company, cur.title || "", cur.raw_description || "")
      .then((r) => { if (r.facts?.length) persistPrep({ company_facts: { company: cur.company, facts: r.facts } }); })
      .catch(() => { /* optional: quotes are shown instead */ });
  }, [job?.id]);

  const [factIdx, setFactIdx] = useState(0);
  useEffect(() => {
    if (!tabLoading || companyFacts.length === 0) return;
    setFactIdx(Math.floor(Math.random() * companyFacts.length));
    const t = setInterval(() => setFactIdx((i) => (i + 1) % companyFacts.length), 6000);
    return () => clearInterval(t);
  }, [tabLoading, companyFacts.length]);

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

  // Every AI tool reads the job description; some search results arrive without one.
  const hasDescription = () => {
    if (jobRef.current?.raw_description?.trim()) return true;
    toast.error("Add the job description on the Overview tab first");
    setActiveTab("overview");
    return false;
  };

  const saveDescription = async (text: string) => {
    const parsed: any = await api.parseJob(text).catch((e) => { toast.error(`Saved, but could not analyze: ${e.message}`); return {}; });
    const cur = jobRef.current;
    const updated = {
      ...cur,
      raw_description: text,
      requirements: parsed.requirements?.length ? parsed.requirements : cur.requirements || [],
      nice_to_have: parsed.nice_to_have?.length ? parsed.nice_to_have : cur.nice_to_have || [],
      description_summary: parsed.description_summary || cur.description_summary || "",
      salary: cur.salary || parsed.salary || "",
    };
    jobRef.current = updated;
    setJob(updated);
    await api.updateJob(id!, updated);
  };

  const startLoading = (tab: string) => { setTabLoading(true); setLoadingTab(tab); setLoadingQuote(getRandomQuote()); };
  const stopLoading = () => { setTabLoading(false); setLoadingTab(null); };

  const runATS = async () => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    if (!hasDescription()) return;
    startLoading("ats");
    try {
      const result = await api.atsScore(getResumeText(), job.raw_description || "");
      setAtsResult(result);
      await persistPrep({ ats: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  // confirmed: credentials the candidate says they have (answers to credential_questions); kept for later runs.
  const runTailor = async (confirmed?: string) => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    if (!hasDescription()) return;
    const credentials = (confirmed ?? jobRef.current?.prep_data?.confirmed_credentials ?? "").trim();
    startLoading("tailor");
    try {
      const resumeText = credentials ? `${getResumeText()}\n\nCANDIDATE-CONFIRMED CREDENTIALS:\n${credentials}` : getResumeText();
      const result = await api.tailorResume(resumeText, job.raw_description || "");
      setTailorResult(result);
      setAcceptedSuggestions([]);
      await persistPrep({ tailor: result, accepted_suggestions: [], confirmed_credentials: credentials });
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
    if (!hasDescription()) return;
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
    if (!hasDescription()) return;
    startLoading("study-guide");
    try {
      const result = await api.studyGuide(job.title || "", job.company || "", job.raw_description || "");
      setStudyGuideResult(result);
      await persistPrep({ study_guide: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const runInterviewPrep = async (stage: string, interviewer: string) => {
    if (!hasDescription()) return;
    startLoading("interview");
    try {
      const result = await api.interviewPrep(job.title || "", job.company || "", job.raw_description || "", stage, interviewer || undefined);
      const prev = normalizeInterview(interviewResult);
      const merged = { stages: { ...prev, [stage]: { ...result, interviewer: interviewer || "" } } };
      setInterviewResult(merged);
      await persistPrep({ interview: merged });
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
        {activeTab === "overview" && <OverviewTab job={job} onSaveDescription={saveDescription} />}
        {activeTab === "ats" && <ATSTab result={atsResult} loading={tabLoading} onRun={runATS} />}
        {activeTab === "tailor" && (
          <TailorTab
            fileBase={safeFileName(job.company, job.title)}
            result={tailorResult}
            loading={tabLoading}
            onRun={() => runTailor()}
            onConfirmCredentials={(text) => runTailor(text)}
            acceptedSuggestions={[]}
            onAccept={() => {}}
            onReject={() => {}}
            atsScore={atsResult?.score}
            getResumeText={getResumeText}
            jobDescription={job.raw_description || ""}
          />
        )}
        {activeTab === "cover-letter" && <CoverLetterTab result={coverLetterResult} loading={tabLoading} onRun={runCoverLetter} fileBase={safeFileName("Cover Letter", job.company, job.title)} />}
        {activeTab === "study-guide" && <StudyGuideTab result={studyGuideResult} loading={tabLoading} onRun={runStudyGuide} onSave={(training) => { const next = { ...studyGuideResult, training }; setStudyGuideResult(next); persistPrep({ study_guide: next }); }} jobTitle={job.title || ""} jobDescription={job.raw_description || ""} />}
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
            {companyFacts.length > 0 ? (
              <div className="mt-5 text-left border border-[#028FA2]/20 bg-[#028FA2]/[0.06] rounded-lg p-4" aria-live="polite">
                <p className="text-[0.667rem] uppercase tracking-wider font-bold text-[#028FA2] mb-1">Know before you interview: {job.company}</p>
                <p key={factIdx} className="text-sm text-white leading-relaxed animate-fade-in">{companyFacts[factIdx % companyFacts.length]}</p>
                <p className="text-[0.6rem] text-[#555] mt-2">AI-generated. Verify key details on the company's website.</p>
              </div>
            ) : (
              <p className="text-xs text-[#888] italic mt-4 px-4 leading-relaxed">"{loadingQuote}"</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────────
function OverviewTab({ job, onSaveDescription }: { job: any; onSaveDescription: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const analyzed = job.description_summary || job.requirements?.length > 0;
  const save = async (value: string) => {
    if (!value.trim()) return;
    setSaving(true);
    try { await onSaveDescription(value.trim()); setText(""); } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  if (!job.raw_description?.trim()) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">This job has no description yet</h3>
          <p className="text-xs text-[#888] mt-1">
            The job board did not include it. Open the{" "}
            {job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="text-[#028FA2] underline">original posting</a> : "original posting"}
            , copy the full description and paste it below. ATS score, tailoring, cover letter, study guide and interview prep all use it.
          </p>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste the full job description here" aria-label="Job description"
          className="w-full text-sm bg-white/[0.04] border border-white/10 rounded-lg p-3 text-white placeholder:text-[#555] focus:outline-none focus:border-[#028FA2]" />
        <button onClick={() => save(text)} disabled={saving || !text.trim()} className="glass-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Save and analyze
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {!analyzed && (
        <div className="flex items-center justify-between gap-3 border border-[#028FA2]/20 bg-[#028FA2]/[0.06] rounded-lg p-3">
          <p className="text-xs text-[#888]">The summary and requirements have not been extracted yet.</p>
          <button onClick={() => save(job.raw_description)} disabled={saving} className="glass-btn-primary flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 shrink-0">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Analyze description
          </button>
        </div>
      )}
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
                  <span className={`text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded ${gap.importance === "critical" ? "bg-red-100 text-red-700" : gap.importance === "important" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{gap.importance}</span>
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
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#028FA2]/10 text-[0.667rem] font-bold text-[#028FA2]">{i + 1}</span>
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
function TailorTab({ result, loading, onRun, onConfirmCredentials, fileBase }: {
  result: any; loading: boolean; onRun: () => void; onConfirmCredentials: (text: string) => void; fileBase: string;
  acceptedSuggestions: number[]; onAccept: (i: number) => void; onReject: (i: number) => void;
  atsScore: number | undefined; getResumeText: () => string; jobDescription: string;
}) {
  const sections = result?.structured_sections || [];

  const buildBlocks = (): DocBlock[] => {
    if (sections.length === 0) return textToBlocks(result?.tailored_resume || "", true);
    const blocks: DocBlock[] = [];
    for (const sec of sections) {
      if (sec.type === "header") {
        if (sec.lines?.[0]) blocks.push({ kind: "name", text: sec.lines[0] });
        const contact = sec.lines?.slice(1).join(" | ");
        if (contact) blocks.push({ kind: "contact", text: contact });
      } else if (sec.entries?.length > 0) {
        blocks.push({ kind: "heading", text: sec.name });
        for (const entry of sec.entries) {
          blocks.push({ kind: "entry", title: entry.title || "", org: entry.org, right: [entry.date, entry.location].filter(Boolean).join(" | ") });
          for (const b of entry.bullets || []) blocks.push({ kind: "bullet", text: b });
        }
      } else if (sec.lines?.length > 0) {
        blocks.push({ kind: "heading", text: sec.name });
        for (const line of sec.lines) blocks.push({ kind: "para", text: line });
      }
    }
    return blocks;
  };
  const resumeName = () => {
    const name = sections.find((x: any) => x.type === "header")?.lines?.[0];
    return safeFileName(name, "Resume", fileBase);
  };
  const hasResume = sections.length > 0 || !!result?.tailored_resume;
  const onPDF = () => { if (!hasResume) return; try { exportPDF(resumeName(), buildBlocks()); } catch (e: any) { toast.error(e.message); } };
  const onWord = () => { if (hasResume) downloadWord(resumeName(), buildBlocks()).catch((e) => toast.error(e.message)); };

  const copyToClipboard = () => {
    if (!hasResume) return;
    // From the checked sections, not the AI's plain-text copy, so removed credentials stay out.
    const text = buildBlocks().map((b) => b.kind === "entry" ? [b.title, b.org, b.right].filter(Boolean).join(" | ") : b.kind === "bullet" ? `- ${b.text}` : b.kind === "heading" ? `\n${b.text.toUpperCase()}` : "text" in b ? b.text : "").join("\n");
    navigator.clipboard.writeText(text.trim());
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
          <button onClick={onPDF} className="glass-btn-primary flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md" title="Opens the print dialog. Choose Save as PDF.">
            <Download className="h-3 w-3" /> PDF
          </button>
          <button onClick={onWord} className="glass-btn-primary flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md" title="Editable Word document (.docx)">
            <Download className="h-3 w-3" /> Word
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

      {result?.credential_questions?.length > 0 && <CredentialQuestions questions={result.credential_questions} onSubmit={onConfirmCredentials} />}

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
          <span className="text-[0.667rem] text-[#555]">Download as PDF, or as Word to keep editing</span>
        </div>
        <ResumePaper blocks={buildBlocks()} />
      </div>
    </div>
  );
}

// Requirements the resume does not show. The AI may not invent them (#30), so the candidate is asked instead.
function CredentialQuestions({ questions, onSubmit }: { questions: { requirement: string; question: string }[]; onSubmit: (text: string) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const filled = answers.map((a) => a.trim()).filter(Boolean);
  return (
    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Do you have these?</h4>
        <p className="text-xs text-[#888] mt-0.5">The job asks for credentials that are not on your resume. We never add degrees or certifications you have not confirmed. If you have one, or something related, type it exactly as it should appear.</p>
      </div>
      {questions.map((q, i) => (
        <label key={i} className="block">
          <span className="text-xs text-white">{q.question}</span>
          <input value={answers[i]} onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder="e.g. B.S. Information Systems, Texas A&M University, 2016 (leave blank if not)"
            className="mt-1 w-full text-sm bg-white/[0.04] border border-white/10 rounded-md px-3 py-1.5 text-white placeholder:text-[#555] focus:outline-none focus:border-[#028FA2]" />
        </label>
      ))}
      <button onClick={() => onSubmit(filled.join("\n"))} disabled={filled.length === 0} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50">
        <Sparkles className="h-3 w-3" /> Re-tailor with my answers
      </button>
    </div>
  );
}

// The tailored resume as a printed page: greyscale ink on white in both themes, same blocks as the PDF/Word export.
// Inline colours on purpose: the dark theme remaps text and background classes.
function ResumePaper({ blocks }: { blocks: DocBlock[] }) {
  const ink = "#111", muted = "#444", soft = "#555";
  return (
    <div className="px-8 sm:px-10 py-8 max-h-[650px] overflow-y-auto text-[0.8rem] leading-relaxed" style={{ background: "#ffffff", color: ink, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "name": return <h1 key={i} className="text-xl font-bold text-center" style={{ color: ink }}>{b.text}</h1>;
          case "contact": return <p key={i} className="text-[0.7rem] text-center pb-3 mb-3" style={{ color: muted, borderBottom: "1.5px solid #333" }}>{b.text}</p>;
          case "heading": return <h2 key={i} className="text-[0.7rem] font-bold uppercase tracking-[1.2px] pb-0.5 mt-4 mb-2" style={{ color: ink, borderBottom: "1px solid #bbb" }}>{b.text}</h2>;
          case "entry": return (
            <div key={i} className="flex items-baseline justify-between gap-2 mt-2">
              <span><b style={{ color: ink }}>{b.title}</b>{b.org && <span style={{ color: muted }}> | {b.org}</span>}</span>
              {b.right && <span className="text-[0.7rem] whitespace-nowrap" style={{ color: soft }}>{b.right}</span>}
            </div>
          );
          case "bullet": return <p key={i} className="pl-4 -indent-3" style={{ color: ink }}>&bull;&nbsp; {b.text}</p>;
          case "para": return <p key={i} style={{ color: ink }}>{b.text}</p>;
          default: return <div key={i} className="h-2" />;
        }
      })}
    </div>
  );
}

// ─── Cover Letter Tab ────────────────────────────────────────────────────────
function CoverLetterTab({ result, loading, onRun, fileBase }: { result: string; loading: boolean; onRun: () => void; fileBase: string }) {
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
          <button onClick={() => { try { exportPDF(fileBase, textToBlocks(result)); } catch (e: any) { toast.error(e.message); } }} className="glass-btn-primary flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md" title="Opens the print dialog. Choose Save as PDF.">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button onClick={() => downloadWord(fileBase, textToBlocks(result)).catch((e) => toast.error(e.message))} className="glass-btn-primary flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md" title="Editable Word document (.docx)">
            <Download className="h-3.5 w-3.5" /> Word
          </button>
          <button onClick={onRun} className="glass-btn flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md">Re-generate</button>
        </div>
      </div>
      <LetterPaper text={result} />
    </div>
  );
}

// ─── Study Guide Tab (Training System - ported from paid webapp) ─────────────
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
  quiz?: { question: string; options: string[]; correctIndex: number; explanation?: string }[];
  quizScore?: { correct: number; total: number };
}

const LESSON_TEMPLATES = [
  { title: "Core Concepts", type: "read" as const, duration: "20 min" },
  { title: "Scenario Practice", type: "practice" as const, duration: "15 min" },
  { title: "Real-World Patterns", type: "read" as const, duration: "20 min" },
  { title: "Applied Scenarios", type: "practice" as const, duration: "15 min" },
  { title: "Knowledge Check", type: "quiz" as const, duration: "10 min" },
];

function buildModulesFromGuide(data: any): TrainingModule[] {
  // Saved progress (lesson content, scores, completion) wins over the bare outline.
  if (Array.isArray(data?.training) && data.training.length > 0) {
    return data.training.map((m: TrainingModule) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, generating: false })) }));
  }
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

function studyReadiness(modules: TrainingModule[]) {
  const lessons = modules.flatMap((m) => m.lessons);
  const scored = lessons.filter((l) => l.quizScore && l.quizScore.total > 0);
  const correct = scored.reduce((a, l) => a + l.quizScore!.correct, 0);
  const total = scored.reduce((a, l) => a + l.quizScore!.total, 0);
  const accuracy = total > 0 ? correct / total : 0;
  const coverage = lessons.length > 0 ? scored.length / lessons.length : 0;
  return { readiness: Math.round(accuracy * coverage * 100), accuracy: Math.round(accuracy * 100), coverage: Math.round(coverage * 100), tested: scored.length, lessons: lessons.length };
}

function StudyGuideTab({ result, loading, onRun, onSave, jobTitle, jobDescription }: { result: any; loading: boolean; onRun: () => void; onSave: (training: TrainingModule[]) => void; jobTitle?: string; jobDescription?: string }) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [openModuleIdx, setOpenModuleIdx] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ mod: number; lesson: number } | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [showPodcastModal, setShowPodcastModal] = useState(false);

  // Rebuild only when the outline changes (a new study guide), not when progress is saved back into result.
  useEffect(() => {
    if (result) {
      const data = result?.content ? (() => { try { return JSON.parse(result.content); } catch { return result; } })() : result;
      setModules(buildModulesFromGuide(data));
    }
  }, [result?.modules, result?.content]);

  // Save lesson content and progress shortly after it changes.
  const dirty = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      dirty.current = false;
      onSaveRef.current(modules.map((m) => ({ ...m, lessons: m.lessons.map(({ generating, ...l }) => l) })));
    }, 800);
    return () => clearTimeout(t);
  }, [modules]);

  const updateLessonState = useCallback((modIdx: number, lessonIdx: number, updates: Partial<Lesson>) => {
    dirty.current = true;
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

  const handleQuizScored = useCallback((score: { correct: number; total: number }) => {
    if (!activeLesson) return;
    updateLessonState(activeLesson.mod, activeLesson.lesson, { quizScore: score });
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
          onQuizScored={handleQuizScored}
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
            <p className="text-[0.667rem] uppercase tracking-wider text-[#028FA2] font-bold">Module {openModuleIdx + 1}</p>
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
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold ${lesson.completed ? "bg-green-500 text-white" : "bg-[#028FA2] text-white"}`}>
                    {lesson.completed ? "✓" : li + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    lesson.type === "read" ? "bg-[#028FA2]/10 text-[#028FA2]" : lesson.type === "practice" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700"
                  }`}>{lesson.type}</span>
                  {hasContent && <span className="text-[0.6rem] text-green-600 font-medium">✦ Ready</span>}
                </div>
                <h4 className={`text-sm font-semibold ${lesson.completed ? "line-through opacity-60" : ""}`}>{lesson.title}</h4>
                <p className="text-[0.667rem] text-gray-500 mt-1">{lesson.duration}{lesson.quizScore ? ` · Score ${lesson.quizScore.correct}/${lesson.quizScore.total}` : ""}</p>
                {lesson.generating && <span className="text-[0.667rem] text-[#028FA2] animate-pulse mt-1 block">Generating…</span>}
              </button>
            );
          })}
        </div>
        {completedCount < mod.lessons.length && (
          <button
            onClick={() => { dirty.current = true; setModules((prev) => prev.map((m, i) => i !== openModuleIdx ? m : { ...m, lessons: m.lessons.map((l) => ({ ...l, completed: true })) })); }}
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

      {/* Readiness */}
      {(() => {
        const r = studyReadiness(modules);
        const label = r.tested === 0 ? "Not tested yet" : r.readiness >= 80 ? "Interview ready" : r.readiness >= 50 ? "Getting there" : "Keep practising";
        const color = r.tested === 0 ? "#a1a1aa" : r.readiness >= 80 ? "#22c55e" : r.readiness >= 50 ? "#eab308" : "#ef4444";
        return (
          <div className="border border-white/10 rounded-xl p-4 flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="27" fill="none" strokeWidth="6" style={{ stroke: "rgba(128,128,128,0.15)" }} />
                <circle cx="32" cy="32" r="27" fill="none" strokeWidth="6" strokeLinecap="round" style={{ stroke: color }} strokeDasharray={`${(r.readiness / 100) * 169.6} 169.6`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{r.readiness}%</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Readiness: <span style={{ color }}>{label}</span></p>
              <p className="text-xs text-[#888] mt-0.5">{r.accuracy}% of answers correct across {r.tested} of {r.lessons} lessons tested.</p>
              <p className="text-[0.667rem] text-[#555] mt-0.5">Every lesson ends with graded questions. Readiness is your accuracy weighted by how much of the guide you have been tested on.</p>
            </div>
          </div>
        );
      })()}

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
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.667rem] font-bold shadow-sm ${isModDone ? "bg-green-500 text-white" : "bg-[#028FA2] text-white"}`}>
                  {isModDone ? "✓" : mi + 1}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isModDone ? "bg-green-100 text-green-600" : "bg-[#028FA2]/10 text-[#028FA2]"}`}>
                  {anyGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : isModDone ? <Check className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`text-sm font-semibold ${isModDone ? "line-through" : ""}`}>{mod.title}</h4>
                  <p className="text-[0.667rem] text-gray-500 mt-0.5 line-clamp-2">{mod.description}</p>
                  <p className="text-[0.667rem] text-gray-400 mt-1.5">{modCompleted}/{modTotal} lessons</p>
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
              Use Google NotebookLM to create an AI-generated podcast discussion about these job requirements. The job description will be copied to your clipboard. Paste it as a source in NotebookLM and click <strong>"Generate Audio Overview"</strong>.
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
// Splits text into cards of at most two sentences so the learner reads one small idea at a time.
function toCards(sections: { heading: string; body: string; codeSnippet?: string }[]) {
  const cards: { heading: string; text: string; codeSnippet?: string }[] = [];
  for (const sec of sections) {
    const sentences = (sec.body || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).filter(Boolean);
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) chunks.push(sentences.slice(i, i + 2).join(" "));
    if (chunks.length === 0) continue;
    chunks.forEach((text, ci) => cards.push({ heading: sec.heading, text, codeSnippet: ci === chunks.length - 1 ? sec.codeSnippet : undefined }));
  }
  return cards;
}

const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

function LessonPlayerInline({ lesson, moduleTitle, lessonIndex, totalLessons, onClose, onComplete, onQuizScored }: {
  lesson: Lesson; moduleTitle: string; lessonIndex: number; totalLessons: number; onClose: () => void; onComplete: () => void; onQuizScored: (score: { correct: number; total: number }) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  const cards = toCards(lesson.sections || []);
  const quiz = lesson.quiz || [];
  const hasQuiz = quiz.length > 0;
  const quizStepIdx = cards.length;
  const totalSteps = cards.length + (hasQuiz ? 1 : 0) + 1;
  const summaryStepIdx = totalSteps - 1;
  const isOnCard = currentStep < cards.length;
  const isOnQuiz = hasQuiz && currentStep === quizStepIdx;
  const isOnSummary = currentStep === summaryStepIdx;
  const card = cards[currentStep];
  const quizCorrect = Object.entries(quizAnswers).filter(([qi, ai]) => quiz[Number(qi)]?.correctIndex === ai).length;

  const stopSpeaking = () => { if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false); };
  const speak = (text: string, onEnd?: () => void) => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onend = () => { setSpeaking(false); onEnd?.(); };
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  // Auto-play reads each card and moves on until the questions.
  useEffect(() => {
    if (!autoPlay || !isOnCard || !card) return;
    speak(card.text, () => setCurrentStep((p) => (p < cards.length - 1 ? p + 1 : p)));
  }, [currentStep, autoPlay]);
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, []);

  const go = (step: number) => { if (!autoPlay) stopSpeaking(); setCurrentStep(step); };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button onClick={() => { stopSpeaking(); onClose(); }} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to module
        </button>
        <div className="text-center">
          <p className="text-[0.667rem] text-[#555]">{moduleTitle} · Lesson {lessonIndex + 1}/{totalLessons}</p>
          <h3 className="text-sm font-semibold text-white">{lesson.title}</h3>
        </div>
        <div className="w-16" />
      </div>

      {/* Step progress bar */}
      <div className="flex items-center gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <button key={i} onClick={() => go(i)} aria-label={`Go to step ${i + 1}`} className={`h-2 flex-1 rounded-full transition-all cursor-pointer ${i < currentStep ? "bg-[#028FA2]" : i === currentStep ? "bg-[#028FA2] scale-y-125 shadow" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-[0.667rem] text-gray-400">Step {currentStep + 1} of {totalSteps} · {Math.round(((currentStep + 1) / totalSteps) * 100)}%</p>

      {/* Content */}
      <div className="min-h-[260px]">
        {isOnCard && card && (
          <div key={currentStep} className="space-y-4 animate-fade-in">
            <p className="text-[0.667rem] uppercase tracking-wider text-[#028FA2] font-bold">{card.heading}</p>
            <div className="p-6 rounded-xl border border-white/10 bg-white/[0.02] min-h-[140px] flex items-center">
              <p className="text-lg text-white leading-relaxed">{card.text}</p>
            </div>
            {card.codeSnippet && (
              <div className="rounded-xl bg-gray-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                  <span className="text-[0.667rem] text-gray-400 font-mono uppercase">Code Example</span>
                  <button onClick={() => { navigator.clipboard.writeText(card.codeSnippet || ""); toast.success("Copied!"); }} className="text-[0.667rem] text-[#028FA2] font-bold">Copy</button>
                </div>
                <pre className="p-4 text-xs font-mono text-gray-200 whitespace-pre-wrap overflow-x-auto">{card.codeSnippet}</pre>
              </div>
            )}
            {canSpeak && (
              <div className="flex items-center gap-3">
                <button onClick={() => (speaking ? stopSpeaking() : speak(card.text))} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#028FA2]/40 text-[#028FA2] hover:bg-[#028FA2]/10">
                  {speaking ? <><VolumeX className="h-3.5 w-3.5" /> Stop</> : <><Volume2 className="h-3.5 w-3.5" /> Listen</>}
                </button>
                <label className="flex items-center gap-1.5 text-xs text-[#888] cursor-pointer">
                  <input type="checkbox" checked={autoPlay} onChange={(e) => { setAutoPlay(e.target.checked); if (!e.target.checked) stopSpeaking(); }} className="accent-[#028FA2]" />
                  Auto-play cards
                </label>
              </div>
            )}
          </div>
        )}

        {isOnQuiz && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-amber-500/[0.06] p-4 rounded-xl border-l-4 border-amber-400">
              <p className="text-[0.667rem] uppercase tracking-wider text-amber-400 font-bold">{lesson.type === "practice" ? "Scenario practice" : "Knowledge check"}</p>
              <h4 className="text-lg font-bold text-white mt-1">{quiz.length} graded {quiz.length === 1 ? "question" : "questions"}</h4>
            </div>
            {quiz.map((q, qi) => (
              <div key={qi} className="space-y-2 border border-white/10 rounded-xl p-4">
                <p className="text-sm font-semibold text-white">{qi + 1}. {q.question}</p>
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
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[0.6rem] font-bold">{String.fromCharCode(65 + oi)}</span>
                        <span>{opt}</span>
                        {quizSubmitted && isCorrect && <Check className="h-3.5 w-3.5 text-green-500 ml-auto" />}
                        {quizSubmitted && selected && !isCorrect && <X className="h-3.5 w-3.5 text-red-500 ml-auto" />}
                      </button>
                    );
                  })}
                </div>
                {quizSubmitted && q.explanation && <p className="text-xs text-[#888]">{q.explanation}</p>}
              </div>
            ))}
            {!quizSubmitted && (
              <button onClick={() => { setQuizSubmitted(true); onQuizScored({ correct: quizCorrect, total: quiz.length }); }} disabled={Object.keys(quizAnswers).length < quiz.length} className="w-full py-2.5 text-xs font-medium rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                Check answers
              </button>
            )}
            {quizSubmitted && (
              <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-lg text-center">
                <p className="text-sm font-bold text-white">{quizCorrect}/{quiz.length} correct</p>
              </div>
            )}
          </div>
        )}

        {isOnSummary && (
          <div className="space-y-4 animate-fade-in text-center py-6">
            <div className="flex h-14 w-14 mx-auto items-center justify-center rounded-lg bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-white">Lesson complete</h3>
            <p className="text-sm text-gray-500">{cards.length} cards{hasQuiz ? (quizSubmitted ? ` · ${quizCorrect}/${quiz.length} correct` : " · questions not answered yet") : ""}</p>
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
        <button onClick={() => go(Math.max(0, currentStep - 1))} disabled={currentStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 disabled:opacity-30">
          <ArrowLeft className="h-3 w-3" /> Previous
        </button>
        {currentStep === summaryStepIdx ? (
          <button onClick={() => { stopSpeaking(); onComplete(); }} className="px-4 py-2 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5" /> Complete Lesson
          </button>
        ) : (
          <button onClick={() => go(Math.min(totalSteps - 1, currentStep + 1))} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c]">
            Next <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Interview Prep Tab - one practice set per interview stage ──────────────
const INTERVIEW_STAGES = [
  { key: "recruiter", label: "Recruiter screen", desc: "Motivation, background, fit, salary and logistics." },
  { key: "hiring_manager", label: "Hiring manager", desc: "Impact, ownership, judgement and how you would work on the team." },
  { key: "technical", label: "Technical", desc: "Core skills, tools, scenarios and trade-offs from the job description." },
  { key: "final", label: "Final / culture", desc: "Values, leadership, long-term goals and questions for the company." },
];

// Interview prep saved before stages existed is kept as a "General" set.
function normalizeInterview(result: any): Record<string, any> {
  if (!result) return {};
  const data = result?.content ? (() => { try { return JSON.parse(result.content); } catch { return result; } })() : result;
  if (data?.stages) return data.stages;
  if (data?.rounds) return { general: data };
  return {};
}

function parseStageQuestions(data: any) {
  const all: any[] = [];
  data?.rounds?.forEach((round: any) => {
    const roundDiff = round.difficulty || (round.name?.toLowerCase()?.includes("easy") ? "easy" : round.name?.toLowerCase()?.includes("hard") ? "hard" : "medium");
    (round?.questions || []).forEach((q: any) => {
      if (!q.question) return;
      const diff = ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : roundDiff;
      const defaultTime = diff === "easy" ? 120 : diff === "hard" ? 300 : 180;
      const opts = q.options?.map ? q.options.map((o: any) => typeof o === "string" ? { label: o, correct: false } : o) : [
        { label: q.sampleAnswer || "Best answer", correct: true },
        { label: "Not sure", correct: false },
        { label: "Irrelevant answer", correct: false },
        { label: "Partially correct", correct: false },
      ];
      if (!opts.some((o: any) => o.correct)) opts[0].correct = true;
      all.push({ question: q.question, options: opts, timeLimit: q.timeLimit || defaultTime, difficulty: diff, explanation: q.explanation || "" });
    });
  });
  const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
  all.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
  return { all, overview: data?.overview || "", tips: (data?.tips || []) as string[], insights: (data?.interviewerInsights || []) as string[] };
}

function InterviewTab({ result, loading, onRun }: { result: any; loading: boolean; onRun: (stage: string, interviewer: string) => void; jobTitle?: string; jobDescription?: string }) {
  const stages = normalizeInterview(result);
  const tabs = [...(stages.general ? [{ key: "general", label: "General", desc: "Your earlier interview prep." }] : []), ...INTERVIEW_STAGES];
  const [stage, setStage] = useState<string>(() => tabs.find((t) => stages[t.key])?.key || "recruiter");
  const [interviewer, setInterviewer] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(stages).map(([k, v]: [string, any]) => [k, v?.interviewer || ""])));
  const [mode, setMode] = useState<"lobby" | "zone" | "review">("lobby");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  const stageData = stages[stage];
  const stageInfo = tabs.find((t) => t.key === stage)!;
  const parsed = parseStageQuestions(stageData);
  const questions = parsed.all;

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

  const startInterview = () => {
    setCurrentQ(0);
    setAnswers({});
    setTotalTime(0);
    setMode("zone");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  if (loading) return <LoadingState text={`Preparing ${stageInfo.label.toLowerCase()} questions...`} />;

  // ─── REVIEW MODE ───
  if (mode === "review") {
    const correct = Object.entries(answers).filter(([qi, ai]) => {
      const q = questions[Number(qi)];
      return q?.options[Number(ai)]?.correct;
    }).length;
    const skipped = Object.entries(answers).filter(([, ai]) => Number(ai) === -1).length;
    const score = Math.round((correct / questions.length) * 100);
    const byDifficulty = (diff: string) => {
      const indices = questions.map((q: any, i: number) => q.difficulty === diff ? i : -1).filter((i: number) => i >= 0);
      const c = indices.filter((i: number) => questions[i]?.options[answers[i]]?.correct).length;
      return { total: indices.length, correct: c };
    };

    return (
      <div className="space-y-5">
        <div className="text-center py-6 bg-[#028FA2]/[0.04] rounded-lg border border-[#028FA2]/20">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-lg bg-[#1a1a1a] shadow-lg mb-3">
            <Check className="h-8 w-8 text-[#028FA2]" />
          </div>
          <h3 className="text-xl font-bold text-white">{stageInfo.label} complete</h3>
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
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white ${isCorrect ? "bg-green-500" : wasSkipped ? "bg-gray-400" : "bg-red-500"}`}>
                      {isCorrect ? "✓" : wasSkipped ? "-" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{q.question}</p>
                      <span className={`inline-block mt-1 text-[0.6rem] font-bold uppercase px-1.5 py-0.5 rounded ${q.difficulty === "easy" ? "bg-green-100 text-green-700" : q.difficulty === "hard" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{q.difficulty}</span>
                      {q.explanation && <p className="text-xs text-[#888] mt-1">{q.explanation}</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>

        <div className="flex gap-3">
          <button onClick={() => { setMode("lobby"); setCurrentQ(0); setAnswers({}); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-[#888] bg-white/[0.04] border border-white/10 rounded-xl hover:bg-gray-100">Back to rounds</button>
          <button onClick={startInterview} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c]">Retake</button>
        </div>
      </div>
    );
  }

  // ─── INTERVIEW ZONE (timed mode) ───
  if (mode === "zone" && questions.length > 0) {
    const q = questions[currentQ];
    const selected = answers[currentQ];
    const diffColor = q?.difficulty === "easy" ? "text-green-600" : q?.difficulty === "hard" ? "text-red-600" : "text-amber-600";
    const diffBg = q?.difficulty === "easy" ? "bg-green-50 border-green-200" : q?.difficulty === "hard" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-[#0a2540] rounded-xl text-white">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${timeLeft > 10 ? "bg-green-400 animate-pulse" : "bg-red-400 animate-pulse"}`} />
            <span className="text-sm font-mono font-bold">{formatTime(timeLeft)}</span>
            <span className="text-[0.667rem] text-gray-400 border-l border-gray-600 pl-3">Total: {formatTime(totalTime)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[0.667rem] text-gray-300 hidden sm:inline">{stageInfo.label}</span>
            <span className={`text-[0.6rem] font-bold uppercase px-2 py-0.5 rounded ${diffBg} ${diffColor}`}>{q?.difficulty}</span>
            <span className="text-xs text-gray-300">Q{currentQ + 1}/{questions.length}</span>
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-gray-800/20">
          <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft > 10 ? "bg-[#028FA2]" : "bg-red-500"}`} style={{ width: `${(timeLeft / (q?.timeLimit || 30)) * 100}%` }} />
        </div>

        <div className="p-8 bg-white/[0.02] rounded-lg border border-white/10 text-center min-h-[140px] flex items-center justify-center">
          <h3 className="text-lg font-semibold text-white leading-relaxed">{q?.question}</h3>
        </div>

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

        {showExplanation && q?.explanation && (
          <div className="p-3 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-xl animate-fade-in">
            <p className="text-xs text-white"><strong>Explanation:</strong> {q.explanation}</p>
          </div>
        )}

        {selected !== undefined && (
          <div className="flex justify-end">
            <button onClick={handleNext} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] transition-colors">
              {currentQ < questions.length - 1 ? <>Next <ArrowRight className="h-3.5 w-3.5" /></> : <>Finish round <Check className="h-3.5 w-3.5" /></>}
            </button>
          </div>
        )}

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

  // ─── LOBBY: pick a stage, optionally add the interviewer, generate or start ───
  const interviewerField = stage !== "general" && (
    <div className="text-left">
      <label htmlFor="interviewer-profile" className="block text-xs font-medium text-white mb-1">Interviewer's LinkedIn profile (optional)</label>
      <p className="text-[0.667rem] text-[#555] mb-2">Open their public LinkedIn profile, copy the name, headline, About and Experience sections, and paste them here. Questions will be tailored to their background. It stays on your machine and is only sent to your AI provider.</p>
      <textarea
        id="interviewer-profile"
        value={interviewer[stage] || ""}
        onChange={(e) => setInterviewer((p) => ({ ...p, [stage]: e.target.value }))}
        rows={4}
        maxLength={6000}
        placeholder={"Jane Doe\nDirector of Identity Engineering at Acme\nAbout: ...\nExperience: ..."}
        className="glass-input w-full rounded-lg px-3 py-2 text-xs"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-white">Interview rounds</h3>
        <p className="text-xs text-[#888] mt-0.5">Practise for each conversation separately. Every round has its own timed question set.</p>
      </div>

      {/* Stage picker */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" role="tablist" aria-label="Interview round">
        {tabs.map((t) => {
          const ready = !!stages[t.key];
          const active = t.key === stage;
          return (
            <button key={t.key} role="tab" aria-selected={active} onClick={() => setStage(t.key)}
              className={`text-left p-3 rounded-xl border transition-all ${active ? "border-[#028FA2]/60 bg-[#028FA2]/10" : "border-white/10 hover:border-[#028FA2]/30"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{t.label}</span>
                {ready && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" aria-label="Generated" />}
              </div>
              <p className="text-[0.667rem] text-[#555] mt-1 line-clamp-2">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {!stageData ? (
        <div className="bg-[#028FA2]/[0.04] rounded-lg border border-[#028FA2]/20 p-6 space-y-4">
          <div className="text-center">
            <MessageSquare className="h-7 w-7 text-[#028FA2] mx-auto mb-2" />
            <h3 className="text-base font-bold text-white">{stageInfo.label}</h3>
            <p className="text-sm text-[#888] mt-1">{stageInfo.desc} 12 timed multiple-choice questions, easy to hard.</p>
          </div>
          {interviewerField}
          <div className="text-center">
            <button onClick={() => onRun(stage, interviewer[stage] || "")} className="px-5 py-2.5 bg-[#028FA2] text-white text-sm font-medium rounded-xl hover:bg-[#027a8c]">
              Generate {stageInfo.label} prep
            </button>
          </div>
        </div>
      ) : (
        <>
          {parsed.overview && <p className="text-sm text-[#888]">{parsed.overview}</p>}

          {parsed.insights.length > 0 && (
            <div className="border border-[#028FA2]/20 bg-[#028FA2]/[0.04] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-white uppercase mb-2">About your interviewer</h4>
              <ul className="space-y-1">
                {parsed.insights.map((tip: string, i: number) => (
                  <li key={i} className="text-xs text-[#888] flex items-start gap-2"><span className="text-[#028FA2] mt-0.5">•</span> {tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <div key={d} className={`p-4 rounded-xl border text-center ${d === "easy" ? "border-green-200 bg-green-50" : d === "hard" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                <p className={`text-xl font-bold ${d === "easy" ? "text-green-600" : d === "hard" ? "text-red-600" : "text-amber-600"}`}>{questions.filter((q: any) => q.difficulty === d).length}</p>
                <p className="text-xs font-semibold text-white capitalize">{d}</p>
                <p className="text-[0.667rem] text-[#555] mt-0.5">{d === "easy" ? 2 : d === "hard" ? 5 : 3} min per question</p>
              </div>
            ))}
          </div>

          <div className="bg-[#028FA2]/[0.04] rounded-lg border border-[#028FA2]/20 p-6 text-center">
            <h3 className="text-lg font-bold text-white">Start the {stageInfo.label.toLowerCase()} round</h3>
            <p className="text-sm text-[#888] mt-1 mb-4">Timed. Answer each question before time runs out. No going back.</p>
            <button onClick={startInterview} disabled={questions.length === 0} className="px-5 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] transition-colors disabled:opacity-50">
              Start {questions.length} questions
            </button>
          </div>

          {parsed.tips.length > 0 && (
            <div className="border border-white/[0.06] rounded-xl p-4">
              <h4 className="text-xs font-semibold text-white uppercase mb-2">Tips for this round</h4>
              <ul className="space-y-1">
                {parsed.tips.map((tip: string, i: number) => (
                  <li key={i} className="text-xs text-[#888] flex items-start gap-2"><span className="text-[#028FA2] mt-0.5">•</span> {tip}</li>
                ))}
              </ul>
            </div>
          )}

          {stage !== "general" && (
            <details className="border border-white/[0.06] rounded-xl p-4">
              <summary className="text-xs font-medium text-[#028FA2] cursor-pointer">Regenerate this round{stageData?.interviewer ? " (interviewer added)" : ", optionally for a specific interviewer"}</summary>
              <div className="mt-3 space-y-3">
                {interviewerField}
                <button onClick={() => onRun(stage, interviewer[stage] || "")} className="px-4 py-2 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c]">Regenerate {stageInfo.label}</button>
              </div>
            </details>
          )}
        </>
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
