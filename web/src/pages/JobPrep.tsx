import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ScanSearch, FileText, Mail, MessageSquare, Loader2, Copy, Sparkles, Check, X, Download, BookOpen, Volume2, VolumeX, Video, VideoOff, PhoneOff, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, type LessonQueue } from "@/lib/api";
import LetterPaper from "@/components/LetterPaper";
import AtsChecklist from "@/components/AtsChecklist";
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

const MIN_DESCRIPTION = 200;

// Short hash of what a score was computed from, to tell when it is out of date.
function fingerprint(...parts: string[]) {
  let h = 5381;
  for (const ch of parts.join("\u0000")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

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
    if ((jobRef.current?.raw_description?.trim().length || 0) >= MIN_DESCRIPTION) return true;
    toast.error(jobRef.current?.raw_description?.trim() ? "The job description is too short. Paste the full posting on the Overview tab." : "Add the job description on the Overview tab first");
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

  // Scores and study guides are built from the extracted requirements, so extract them first if needed.
  const ensureAnalyzed = async () => {
    const cur = jobRef.current;
    if (!cur?.requirements?.length && cur?.raw_description) await saveDescription(cur.raw_description).catch(() => {});
    return jobRef.current;
  };

  const startLoading = (tab: string) => { setTabLoading(true); setLoadingTab(tab); setLoadingQuote(getRandomQuote()); };
  const stopLoading = () => { setTabLoading(false); setLoadingTab(null); };

  const runATS = async () => {
    if (!selectedResumeId) { toast.error("Select a resume first"); return; }
    if (!hasDescription()) return;
    startLoading("ats");
    try {
      const cur = await ensureAnalyzed();
      const resumeText = getResumeText();
      const result = await api.atsScore(resumeText, cur.raw_description || "", [...(cur.requirements || []), ...(cur.nice_to_have || [])]);
      const scored = { ...result, basis: fingerprint(cur.raw_description || "", resumeText) };
      setAtsResult(scored);
      await persistPrep({ ats: scored });
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
      const cur = await ensureAnalyzed();
      // Requirements the candidate is missing or weak on (from a current ATS check) come first.
      const gaps = atsResult?.method === 2 ? (atsResult.requirements || []).filter((r: any) => r.status !== "met").map((r: any) => r.requirement) : [];
      const result = await api.studyGuide(cur.title || "", cur.company || "", cur.raw_description || "", cur.requirements || [], cur.nice_to_have || [], gaps);
      setStudyGuideResult(result);
      await persistPrep({ study_guide: result });
    } catch (err: any) { toast.error(err.message); }
    finally { stopLoading(); }
  };

  const runInterviewPrep = async (stage: string) => {
    if (!hasDescription()) return;
    startLoading("interview");
    try {
      const result = await api.interviewPrep(job.title || "", job.company || "", job.raw_description || "", stage);
      const prev = normalizeInterview(interviewResult);
      const merged = { stages: { ...prev, [stage]: result } };
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
        {activeTab === "ats" && <ATSTab result={atsResult} loading={tabLoading} onRun={runATS} currentBasis={fingerprint(job.raw_description || "", getResumeText())} />}
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
        {activeTab === "study-guide" && <StudyGuideTab jobId={job.id} company={job.company || ""} facts={companyFacts} result={studyGuideResult} loading={tabLoading} onRun={runStudyGuide} onSave={(training) => { const next = { ...studyGuideResult, training }; setStudyGuideResult(next); return persistPrep({ study_guide: next }); }} jobDescription={job.raw_description || ""} />}
        {activeTab === "interview" && <InterviewTab result={interviewResult} loading={tabLoading} onRun={runInterviewPrep} company={job.company || ""} />}
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
  const autoTried = useRef(false);
  useEffect(() => {
    if (analyzed || autoTried.current || !job.raw_description?.trim()) return;
    autoTried.current = true;
    save(job.raw_description);
  }, [analyzed, job.raw_description]);
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
function ATSTab({ result, loading, onRun, currentBasis }: { result: any; loading: boolean; onRun: () => void; currentBasis: string }) {
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

  const legacy = result?.method !== 2;
  const stale = !legacy && result?.basis && result.basis !== currentBasis;
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
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
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

      {(legacy || stale) && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08]">
          <p className="text-xs text-amber-200">
            {legacy
              ? "This score was made with the old method, which did not check the job description properly. Do not rely on it. Run the scan again."
              : "The job description or your resume has changed since this scan. Run it again for a current score."}
          </p>
          <button onClick={onRun} className="glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-md shrink-0">Scan again</button>
        </div>
      )}

      <AtsChecklist result={result} />

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
  requirements?: string[];
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
    requirements: Array.isArray(mod.requirements) ? mod.requirements : [],
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

const stripRuntime = (modules: TrainingModule[]) => modules.map((m) => ({ ...m, lessons: m.lessons.map(({ generating, ...l }) => l) }));

function StudyGuideTab({ jobId, company, facts, result, loading, onRun, onSave, jobDescription }: { jobId: string; company: string; facts: string[]; result: any; loading: boolean; onRun: () => void; onSave: (training: TrainingModule[]) => Promise<void>; jobDescription?: string }) {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [openModuleIdx, setOpenModuleIdx] = useState<number | null>(null);
  const [activeLesson, setActiveLesson] = useState<{ mod: number; lesson: number } | null>(null);
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
      onSaveRef.current(stripRuntime(modules));
    }, 800);
    return () => clearTimeout(t);
  }, [modules]);

  const updateLessonState = useCallback((modIdx: number, lessonIdx: number, updates: Partial<Lesson>) => {
    dirty.current = true;
    setModules((prev) =>
      prev.map((m, mi) => mi !== modIdx ? m : { ...m, lessons: m.lessons.map((l, li) => li !== lessonIdx ? l : { ...l, ...updates }) })
    );
  }, []);

  // Lessons are generated by the server one after another and saved to the job, so the user can leave
  // this page (or the app) and come back. This tab only queues them and polls for progress.
  const modulesRef = useRef(modules);
  modulesRef.current = modules;
  const openWhenReady = useRef<string | null>(null);
  const reportedFailures = useRef(new Set<string>());

  const applyQueue = useCallback(async (q: LessonQueue) => {
    const pending = new Set(q.pending);
    const needsContent = modulesRef.current.some((m, mi) => m.lessons.some((l, li) => l.generating && !pending.has(`${mi}:${li}`)));
    const saved: TrainingModule[] | undefined = needsContent ? (await api.getJob(jobId).catch(() => null))?.prep_data?.study_guide?.training : undefined;
    for (const f of q.failed) {
      if (reportedFailures.current.has(f.key)) continue;
      reportedFailures.current.add(f.key);
      toast.error(`A lesson could not be generated: ${f.error}`);
    }
    setModules((prev) => prev.map((m, mi) => ({
      ...m,
      lessons: m.lessons.map((l, li) => {
        const key = `${mi}:${li}`;
        const fromServer = saved?.[mi]?.lessons?.[li];
        const content = !l.sections?.length && fromServer?.sections?.length
          ? { sections: fromServer.sections, keyPoints: fromServer.keyPoints || [], practicePrompt: fromServer.practicePrompt || "", quiz: fromServer.quiz || [] }
          : {};
        return { ...l, ...content, generating: pending.has(key) };
      }),
    })));
    const want = openWhenReady.current;
    if (want && !pending.has(want)) {
      openWhenReady.current = null;
      const [mi, li] = want.split(":").map(Number);
      if (saved?.[mi]?.lessons?.[li]?.sections?.length) setActiveLesson({ mod: mi, lesson: li });
    }
  }, [jobId]);

  const queueLessons = useCallback(async (items: { mod: number; lesson: number; fresh?: boolean }[]) => {
    if (items.length === 0) return;
    try {
      // The server reads the module outline from the job, so save it first.
      dirty.current = false;
      await onSaveRef.current(stripRuntime(modulesRef.current));
      reportedFailures.current.clear();
      await applyQueue(await api.queueLessons(jobId, items));
    } catch (err: any) {
      toast.error(err.message || "Failed to start generating lessons");
    }
  }, [jobId, applyQueue]);

  const anyGenerating = modules.some((m) => m.lessons.some((l) => l.generating));
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(() => { api.lessonStatus(jobId).then(applyQueue).catch(() => {}); }, 3000);
    return () => clearInterval(t);
  }, [anyGenerating, jobId, applyQueue]);

  // Coming back to the page while lessons are still being generated: pick the queue up again.
  const hasModules = modules.length > 0;
  useEffect(() => {
    if (hasModules) api.lessonStatus(jobId).then((q) => { if (q.pending.length) applyQueue(q); }).catch(() => {});
  }, [hasModules, jobId, applyQueue]);

  const openLessonContent = useCallback((modIdx: number, lessonIdx: number) => {
    const lesson = modules[modIdx]?.lessons[lessonIdx];
    if (!lesson) return;
    if (lesson.sections && lesson.sections.length > 0) {
      setActiveLesson({ mod: modIdx, lesson: lessonIdx });
      return;
    }
    openWhenReady.current = `${modIdx}:${lessonIdx}`;
    queueLessons([{ mod: modIdx, lesson: lessonIdx }]);
  }, [modules, queueLessons]);

  const missingLessons = (modIdx?: number) => modules.flatMap((m, mi) =>
    modIdx !== undefined && mi !== modIdx ? [] : m.lessons.flatMap((l, li) => (l.sections?.length || l.generating ? [] : [{ mod: mi, lesson: li }])));
  const regenerateLesson = (mi: number, li: number) => {
    setActiveLesson(null);
    updateLessonState(mi, li, { sections: [], keyPoints: [], quiz: [], quizScore: undefined });
    openWhenReady.current = `${mi}:${li}`;
    queueLessons([{ mod: mi, lesson: li, fresh: true }]);
  };
  const handleGenerateAll = () => { openWhenReady.current = null; queueLessons(missingLessons()); };

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
  const readyLessons = modules.reduce((a, m) => a + m.lessons.filter((l) => l.sections?.length).length, 0);
  const generatingCount = modules.reduce((a, m) => a + m.lessons.filter((l) => l.generating).length, 0);

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
          onRegenerate={() => regenerateLesson(activeLesson.mod, activeLesson.lesson)}
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
            {mod.requirements && mod.requirements.length > 0 && (
              <p className="text-[0.7rem] text-[#888] mt-1"><span className="text-[#2dd4bf] font-semibold">Prepares you for:</span> {mod.requirements.join("; ")}</p>
            )}
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-[#028FA2] h-2 rounded-full transition-all" style={{ width: `${(completedCount / mod.lessons.length) * 100}%` }} />
        </div>
        <p className="text-xs text-gray-500">{completedCount} of {mod.lessons.length} lessons completed</p>
        {anyGenerating ? (
          <LessonsGeneratingBanner count={generatingCount} facts={facts} company={company} />
        ) : mod.lessons.some((l) => !l.sections?.length) && (
          <button onClick={() => { openWhenReady.current = null; queueLessons(missingLessons(openModuleIdx)); }} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
            <Sparkles className="h-3 w-3" /> Generate all lessons in this module
          </button>
        )}
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

      {result?.coverage?.total > 0 && (
        <div className={`p-3 rounded-lg border text-xs ${result.coverage.uncovered.length ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-200" : "border-green-500/25 bg-green-500/[0.06] text-green-300"}`}>
          <p className="font-semibold">Covers {result.coverage.covered.length} of {result.coverage.total} job requirements</p>
          {result.coverage.uncovered.length > 0 && <p className="mt-1">Not covered yet: {result.coverage.uncovered.join("; ")}. Re-generate the guide to try again.</p>}
        </div>
      )}

      {anyGenerating ? (
        <LessonsGeneratingBanner count={generatingCount} facts={facts} company={company} done={readyLessons} total={totalLessons} />
      ) : readyLessons < totalLessons && modules.length > 0 && (
        <div className="border border-[#028FA2]/20 rounded-xl p-4 bg-[#028FA2]/[0.06] flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-white flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Generate all lessons</h4>
            <p className="text-xs text-[#888] mt-0.5">{readyLessons} of {totalLessons} lessons ready. They generate in the background, so you can leave this page.</p>
          </div>
          <button onClick={handleGenerateAll} className="px-3 py-1.5 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c] flex items-center gap-1.5 shrink-0">
            <Sparkles className="h-3 w-3" /> Generate all
          </button>
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
                  {mod.requirements && mod.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {mod.requirements.slice(0, 2).map((r) => <span key={r} className="text-[0.6rem] px-1.5 py-0.5 rounded bg-[#028FA2]/10 text-[#2dd4bf] truncate max-w-[12rem]" title={r}>{r}</span>)}
                      {mod.requirements.length > 2 && <span className="text-[0.6rem] px-1.5 py-0.5 rounded bg-white/[0.06] text-[#888]" title={mod.requirements.slice(2).join("; ")}>+{mod.requirements.length - 2}</span>}
                    </div>
                  )}
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

function LessonPlayerInline({ lesson, moduleTitle, lessonIndex, totalLessons, onClose, onComplete, onQuizScored, onRegenerate }: {
  lesson: Lesson; moduleTitle: string; lessonIndex: number; totalLessons: number; onClose: () => void; onComplete: () => void; onQuizScored: (score: { correct: number; total: number }) => void; onRegenerate: () => void;
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
        <button onClick={() => { stopSpeaking(); onRegenerate(); }} className="text-xs text-[#028FA2] hover:underline" title="Write this lesson again with new content and questions">
          Regenerate
        </button>
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
      shuffleStable(opts, q.question);
      all.push({ question: q.question, options: opts, timeLimit: q.timeLimit || defaultTime, difficulty: diff, explanation: q.explanation || "" });
    });
  });
  const order: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
  all.sort((a, b) => order[a.difficulty] - order[b.difficulty]);
  return { all, overview: data?.overview || "", tips: (data?.tips || []) as string[] };
}

// AIs tend to list the right answer first. Shuffle with a seed from the question text so the order
// is mixed but stays the same on every render and every retake.
function shuffleStable<T>(items: T[], seedText: string) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  for (let i = items.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function InterviewTab({ result, loading, onRun, company }: { result: any; loading: boolean; onRun: (stage: string) => void; company: string }) {
  const stages = normalizeInterview(result);
  const tabs = [...(stages.general ? [{ key: "general", label: "General", desc: "Your earlier interview prep." }] : []), ...INTERVIEW_STAGES];
  const [stage, setStage] = useState<string>(() => tabs.find((t) => stages[t.key])?.key || "recruiter");
  const [mode, setMode] = useState<"lobby" | "zone" | "review">("lobby");
  const [attempt, setAttempt] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [totalTime, setTotalTime] = useState(0);

  const stageData = stages[stage];
  const stageInfo = tabs.find((t) => t.key === stage)!;
  const parsed = parseStageQuestions(stageData);
  const questions = parsed.all;

  const startInterview = () => {
    setAnswers({});
    setTotalTime(0);
    setAttempt((n) => n + 1);
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
          <button onClick={() => { setMode("lobby"); setAnswers({}); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-[#888] bg-white/[0.04] border border-white/10 rounded-xl hover:bg-gray-100">Back to rounds</button>
          <button onClick={startInterview} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c]">Retake</button>
        </div>
      </div>
    );
  }

  // ─── INTERVIEW CALL ───
  if (mode === "zone" && questions.length > 0) {
    return (
      <InterviewCall
        key={attempt}
        questions={questions}
        stageLabel={stageInfo.label}
        company={company}
        onLeave={() => setMode("lobby")}
        onFinish={(a, seconds) => { setAnswers(a); setTotalTime(seconds); setMode("review"); }}
      />
    );
  }

  // ─── LOBBY: pick a stage, generate or start ───
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
          <div className="text-center">
            <button onClick={() => onRun(stage)} className="px-5 py-2.5 bg-[#028FA2] text-white text-sm font-medium rounded-xl hover:bg-[#027a8c]">
              Generate {stageInfo.label} prep
            </button>
          </div>
        </div>
      ) : (
        <>
          {parsed.overview && <p className="text-sm text-[#888]">{parsed.overview}</p>}

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
            <button onClick={() => onRun(stage)} className="text-xs font-medium text-[#028FA2] hover:underline">Regenerate {stageInfo.label} questions</button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Interview call ──────────────────────────────────────────────────────────
// One round run like a video call: the interviewer tile asks (and reads aloud) each question, the candidate
// answers on the side. Fullscreen hides everything else. Keys: 1-4 or A-D answer, Enter next, F fullscreen.
function InterviewCall({ questions, stageLabel, company, onLeave, onFinish }: {
  questions: any[]; stageLabel: string; company: string;
  onLeave: () => void; onFinish: (answers: Record<number, number>, seconds: number) => void;
}) {
  const limitOf = (i: number): number => (questions[i]?.timeLimit > 0 ? questions[i].timeLimit : 120);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  // Set together with currentQ (never in an effect), so a new question can't inherit the last one's 0 and auto-skip.
  const [timeLeft, setTimeLeft] = useState<number>(() => limitOf(0));
  const [totalTime, setTotalTime] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [full, setFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const q = questions[currentQ];
  const selected = answers[currentQ];
  const answered = selected !== undefined;
  const isLast = currentQ === questions.length - 1;
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const initials = stageLabel.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  // Question countdown: stops once answered; reaching 0 counts as skipped.
  useEffect(() => {
    if (answered) return;
    if (timeLeft <= 0) { setAnswers((p) => ({ ...p, [currentQ]: -1 })); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, answered, currentQ]);

  useEffect(() => {
    const t = setInterval(() => setTotalTime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // The interviewer reads each question aloud.
  const speak = useCallback((text: string) => {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [canSpeak]);
  useEffect(() => {
    if (voiceOn && q?.question) speak(q.question);
    else if (canSpeak) { window.speechSynthesis.cancel(); setSpeaking(false); }
  }, [currentQ, voiceOn]);

  // Self view. Nothing is recorded or sent anywhere.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => { toast.error("Camera not available. Check your browser permissions."); setCameraOn(false); });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOn]);

  // Fullscreen with the browser API when available, otherwise a fixed overlay. Esc leaves either.
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFull = () => {
    const el = rootRef.current;
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (full) { setFull(false); return; }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFull(true));
    else setFull(true);
  };

  const stopEverything = () => {
    if (canSpeak) window.speechSynthesis.cancel();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  useEffect(() => () => { if (canSpeak) window.speechSynthesis.cancel(); }, []);

  const choose = (i: number) => {
    if (answered || i < 0 || i >= (q?.options?.length || 0)) return;
    setAnswers((p) => ({ ...p, [currentQ]: i }));
  };
  const next = () => {
    if (!answered) return;
    if (isLast) { stopEverything(); onFinish(answers, totalTime); return; }
    setCurrentQ((i) => i + 1);
    setTimeLeft(limitOf(currentQ + 1));
  };
  const leave = () => { stopEverything(); onLeave(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (["1", "2", "3", "4"].includes(k)) choose(Number(k) - 1);
      else if (["a", "b", "c", "d"].includes(k)) choose(k.charCodeAt(0) - 97);
      else if (k === "enter" || k === "arrowright") next();
      else if (k === "f") toggleFull();
      else if (k === "escape" && full && !document.fullscreenElement) setFull(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const C = { stage: "#0b0d12", tile: "#1b1f27", tileBorder: "rgba(255,255,255,0.08)", text: "#f3f4f6", muted: "#9ca3af", accent: "#028FA2" };
  const lowTime = !answered && timeLeft <= 10;
  const ctrl = "flex flex-col items-center gap-1 min-w-[3.5rem] px-2 py-1.5 rounded-lg text-[0.667rem] transition-colors hover:bg-white/10";

  return (
    <div ref={rootRef} className={`${full ? "fixed inset-0 z-[60] rounded-none" : "rounded-xl"} flex flex-col overflow-hidden`} style={{ background: C.stage, color: C.text, minHeight: full ? undefined : 560 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${C.tileBorder}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 rounded-full shrink-0 animate-pulse" style={{ background: "#ef4444" }} aria-hidden="true" />
          <span className="text-sm font-semibold truncate">{stageLabel} interview{company ? ` · ${company}` : ""}</span>
        </div>
        <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: C.muted }}>
          <span className="font-mono">{fmt(totalTime)}</span>
          <span>Question {currentQ + 1} of {questions.length}</span>
        </div>
      </div>
      <div className="flex gap-0.5 px-4 pt-2" aria-hidden="true">
        {questions.map((_, i) => {
          const a = answers[i];
          const ok = a !== undefined && a >= 0 && questions[i]?.options[a]?.correct;
          const bg = a === undefined ? (i === currentQ ? C.accent : "rgba(255,255,255,0.12)") : ok ? "#22c55e" : a === -1 ? "#6b7280" : "#ef4444";
          return <div key={i} className="h-1 flex-1 rounded-full" style={{ background: bg }} />;
        })}
      </div>

      {/* Call area */}
      <div className="flex-1 grid gap-3 p-3 sm:p-4 lg:grid-cols-[1.4fr_1fr] min-h-0">
        {/* Interviewer tile */}
        <div className="relative rounded-xl flex flex-col items-center justify-center p-6 min-h-[260px] overflow-hidden" style={{ background: C.tile, border: `2px solid ${speaking ? C.accent : C.tileBorder}` }}>
          <div className={`flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold ${speaking ? "animate-pulse" : ""}`} style={{ background: "linear-gradient(135deg,#028FA2,#0a2540)", boxShadow: speaking ? `0 0 0 6px rgba(2,143,162,0.25)` : "none" }}>
            {initials}
          </div>
          <p className="mt-6 text-center text-lg sm:text-xl font-medium leading-relaxed max-w-2xl" aria-live="polite">{q?.question}</p>
          <span className="absolute left-3 bottom-3 text-xs px-2 py-1 rounded-md" style={{ background: "rgba(0,0,0,0.55)" }}>
            {stageLabel}{company ? ` · ${company}` : ""}{speaking ? " · speaking" : ""}
          </span>
          <span className={`absolute right-3 top-3 font-mono text-sm px-2 py-1 rounded-md ${lowTime ? "animate-pulse" : ""}`} style={{ background: lowTime ? "rgba(239,68,68,0.85)" : "rgba(0,0,0,0.55)" }} aria-label={`Time left ${fmt(timeLeft)}`}>
            {answered ? "Answered" : fmt(timeLeft)}
          </span>
        </div>

        {/* Self view + answers */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="relative rounded-xl overflow-hidden h-28 sm:h-36 flex items-center justify-center shrink-0" style={{ background: C.tile, border: `1px solid ${C.tileBorder}` }}>
            {cameraOn ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
              : <div className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-semibold" style={{ background: "#374151" }}>You</div>}
            <span className="absolute left-2 bottom-2 text-[0.667rem] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)" }}>You</span>
          </div>

          <div className="rounded-xl p-3 flex-1 overflow-y-auto space-y-2" style={{ background: C.tile, border: `1px solid ${C.tileBorder}` }}>
            <p className="text-[0.667rem] uppercase tracking-wider font-bold" style={{ color: C.muted }}>Your answer</p>
            {q?.options?.map((opt: any, oi: number) => {
              const isSel = selected === oi;
              let border = C.tileBorder, bg = "transparent";
              if (answered && opt.correct) { border = "#22c55e"; bg = "rgba(34,197,94,0.12)"; }
              else if (answered && isSel) { border = "#ef4444"; bg = "rgba(239,68,68,0.12)"; }
              return (
                <button key={oi} onClick={() => choose(oi)} disabled={answered}
                  className="w-full flex items-start gap-2.5 rounded-lg p-2.5 text-left text-sm transition-colors enabled:hover:bg-white/5"
                  style={{ border: `1.5px solid ${border}`, background: bg, color: C.text }}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: answered && opt.correct ? "#22c55e" : answered && isSel ? "#ef4444" : "rgba(255,255,255,0.1)" }}>
                    {answered && opt.correct ? "✓" : answered && isSel ? "✗" : String.fromCharCode(65 + oi)}
                  </span>
                  <span className="leading-snug">{opt.label}</span>
                </button>
              );
            })}
            {answered && (
              <div className="pt-1 space-y-2 animate-fade-in">
                <p className="text-xs" style={{ color: selected === -1 ? "#fbbf24" : q?.options[selected]?.correct ? "#4ade80" : "#f87171" }}>
                  {selected === -1 ? "Time is up." : q?.options[selected]?.correct ? "Strong answer." : "Not the strongest answer."}
                </p>
                {q?.explanation && <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{q.explanation}</p>}
                <button onClick={next} className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium" style={{ background: C.accent, color: "#fff" }}>
                  {isLast ? <>Finish round <Check className="h-3.5 w-3.5" /></> : <>Next question <ArrowRight className="h-3.5 w-3.5" /></>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${C.tileBorder}`, background: "#111318" }}>
        {canSpeak && (
          <button onClick={() => setVoiceOn((v) => !v)} className={ctrl} aria-pressed={voiceOn} aria-label={voiceOn ? "Mute interviewer voice" : "Unmute interviewer voice"}>
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}<span>{voiceOn ? "Voice on" : "Voice off"}</span>
          </button>
        )}
        {canSpeak && (
          <button onClick={() => q?.question && speak(q.question)} className={ctrl} aria-label="Repeat the question">
            <RotateCcw className="h-4 w-4" /><span>Repeat</span>
          </button>
        )}
        <button onClick={() => setCameraOn((v) => !v)} className={ctrl} aria-pressed={cameraOn} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}>
          {cameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}<span>{cameraOn ? "Camera on" : "Camera off"}</span>
        </button>
        <button onClick={toggleFull} className={ctrl} aria-pressed={full} aria-label={full ? "Exit full screen" : "Full screen"}>
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}<span>{full ? "Exit full" : "Full screen"}</span>
        </button>
        <button onClick={leave} className="flex flex-col items-center gap-1 min-w-[3.5rem] px-3 py-1.5 rounded-lg text-[0.667rem] ml-2" style={{ background: "#dc2626", color: "#fff" }} aria-label="Leave the interview">
          <PhoneOff className="h-4 w-4" /><span>Leave</span>
        </button>
      </div>
      <p className="hidden sm:block text-center text-[0.6rem] pb-2" style={{ color: "#6b7280", background: "#111318" }}>Keys: 1 to 4 to answer, Enter for next, F for full screen. Your camera is only shown to you and never recorded.</p>
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────────────────────
// Shown while lessons generate on the server. Same idea as the full-screen overlay (company facts to read
// while waiting) but it does not block: the user can study, switch tabs or leave.
function LessonsGeneratingBanner({ count, facts, company, done, total }: { count: number; facts: string[]; company: string; done?: number; total?: number }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, facts.length)));
  useEffect(() => {
    if (facts.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % facts.length), 6000);
    return () => clearInterval(t);
  }, [facts.length]);
  return (
    <div className="border border-[#028FA2]/25 bg-[#028FA2]/[0.06] rounded-xl p-4 space-y-3" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <Loader2 className="h-4 w-4 text-[#028FA2] animate-spin mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Generating {count} {count === 1 ? "lesson" : "lessons"}{total ? ` (${done} of ${total} ready)` : ""}</p>
          <p className="text-xs text-[#888] mt-0.5">This keeps going in the background and is saved to this job. You can open ready lessons, use other tabs or leave this page.</p>
        </div>
      </div>
      {total ? (
        <div className="w-full rounded-full h-1.5" style={{ background: "rgba(2,143,162,0.15)" }}>
          <div className="h-1.5 rounded-full transition-all" style={{ background: "#028FA2", width: `${total > 0 ? ((done || 0) / total) * 100 : 0}%` }} />
        </div>
      ) : null}
      {facts.length > 0 && (
        <div className="border-t border-[#028FA2]/15 pt-3">
          <p className="text-[0.667rem] uppercase tracking-wider font-bold text-[#028FA2] mb-1">Know before you interview: {company}</p>
          <p key={i} className="text-sm text-white leading-relaxed animate-fade-in">{facts[i % facts.length]}</p>
        </div>
      )}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-[#028FA2]" />
      <span className="ml-2 text-sm text-gray-500">{text}</span>
    </div>
  );
}
