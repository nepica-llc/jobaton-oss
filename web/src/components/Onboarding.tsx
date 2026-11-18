import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Loader2, Compass, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { extractTextFromPdf, parseResumeText, generateResumeName, profileFromResume } from "@/lib/resumeImport";
import { DEMO_JOB, isDemoJob } from "@/lib/demoJob";

// First run: ask for the resume (fills the profile), then offer a tour of a sample job.
// "Take the tour" elsewhere in the app calls startTour().

const TOUR_EVENT = "jobaton:start-tour";
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

type Step = { title: string; body: string; route?: (demoId: string) => string; target?: string };

const STEPS: Step[] = [
  { title: "Welcome to the tour", body: "This takes about a minute. It uses a sample job so you can see what every step looks like. You can skip at any time." },
  { title: "Your resumes", body: "Upload a PDF resume here. Every tool (ATS score, tailoring, cover letters) reads from the resume you pick.", route: () => "/resume", target: '[data-tour="nav-/resume"]' },
  { title: "Your profile", body: "Filled in from your resume. Job search uses your headline, skills and location, so check it looks right.", route: () => "/profile", target: '[data-tour="nav-/profile"]' },
  { title: "Find and save jobs", body: "Search job boards or paste a job you found. Each saved job gets its own workspace. The sample job is in this list for now.", route: () => "/jobs", target: '[data-tour="nav-/jobs"]' },
  { title: "One workspace per job", body: "These tabs take you from reading the job to being ready for the interview. We'll go through them in order.", route: (id) => `/jobs/${id}?tab=overview`, target: '[data-tour="job-tabs"]' },
  { title: "Overview", body: "The full job description. Requirements are pulled out of it automatically, and every other tab works from them.", route: (id) => `/jobs/${id}?tab=overview`, target: '[data-tour="job-tab-content"]' },
  { title: "ATS score", body: "Each requirement is checked against your resume, with the exact line that proves it. The score is calculated from those checks, so it can't be inflated.", route: (id) => `/jobs/${id}?tab=ats`, target: '[data-tour="job-tab-content"]' },
  { title: "Tailor your resume", body: "Rewrites your resume for this job using only what you've really done. If the job asks for a credential your resume doesn't show, it asks you instead of inventing it.", route: (id) => `/jobs/${id}?tab=tailor`, target: '[data-tour="job-tab-content"]' },
  { title: "Cover letter", body: "Written from your resume and this job. Download it as PDF or Word.", route: (id) => `/jobs/${id}?tab=cover-letter`, target: '[data-tour="job-tab-content"]' },
  { title: "Study guide", body: "Modules built from the job's requirements, weakest areas first. Each module says which requirements it prepares you for.", route: (id) => `/jobs/${id}?tab=study-guide`, target: '[data-tour="job-tab-content"]' },
  { title: "Interview prep", body: "Practise each interview stage, from recruiter screen to final round, in a timed mock call.", route: (id) => `/jobs/${id}?tab=interview`, target: '[data-tour="job-tab-content"]' },
  { title: "You're ready", body: "That's everything. The sample job will be removed. Add your first real job from the Jobs page." },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"none" | "upload" | "offer">("none");
  const [aiReady, setAiReady] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filledFrom, setFilledFrom] = useState("");
  const profileRef = useRef<any>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<number | null>(null);
  const [demoId, setDemoId] = useState("");

  useEffect(() => {
    Promise.all([
      api.getProfile().catch(() => null),
      api.getResumes().catch(() => []),
      fetch("/api/health").then((r) => r.json()).catch(() => ({})),
      api.getJobs().catch(() => []),
    ]).then(([profile, resumes, health, jobs]: any[]) => {
      // An empty profile comes back as the bare {ok, data: null} response (request() falls back to it).
      const { ok: _ok, data: _data, ...saved } = profile || {};
      profileRef.current = saved;
      setAiReady(health?.ai !== false);
      // A tour closed by leaving the page leaves its sample job behind.
      (jobs || []).filter(isDemoJob).forEach((j: any) => api.deleteJob(j.id).catch(() => {}));
      if (!profile?.onboarded) setPhase(resumes?.length ? "offer" : "upload");
    });
  }, []);

  const markDone = () => {
    profileRef.current = { ...profileRef.current, onboarded: true };
    setPhase("none");
    return api.saveProfile(profileRef.current).catch(() => {});
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy("Reading your resume...");
      const text = await extractTextFromPdf(file);
      setBusy("Filling in your profile...");
      const parsed = await parseResumeText(text);
      await api.saveResume({ ...parsed, name: generateResumeName(parsed, 0) });
      profileRef.current = profileFromResume(profileRef.current, parsed);
      await api.saveProfile(profileRef.current);
      setFilledFrom(parsed.fullName || "your resume");
      setPhase("offer");
    } catch (err: any) {
      toast.error(err.message || "Could not read that resume. Try another PDF, or skip for now.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Tour ──
  const begin = async () => {
    markDone();
    try {
      const job: any = await api.createJob(DEMO_JOB);
      setDemoId(job.id);
      setStep(0);
    } catch (err: any) {
      toast.error(err.message || "Could not start the tour");
    }
  };
  const beginRef = useRef(begin);
  beginRef.current = begin;
  useEffect(() => {
    const on = () => { if (step === null) beginRef.current(); };
    window.addEventListener(TOUR_EVENT, on);
    return () => window.removeEventListener(TOUR_EVENT, on);
  }, [step]);

  const end = (finished: boolean) => {
    if (demoId) api.deleteJob(demoId).catch(() => {});
    setStep(null);
    setDemoId("");
    navigate(finished ? "/jobs" : "/");
  };

  useEffect(() => {
    if (step === null) return;
    const route = STEPS[step].route?.(demoId);
    if (route) navigate(route);
  }, [step, demoId]);

  if (step !== null) {
    return <TourStep step={step} onBack={() => setStep(step - 1)} onNext={() => (step === STEPS.length - 1 ? end(true) : setStep(step + 1))} onSkip={() => end(false)} />;
  }
  if (phase === "none") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
        {phase === "upload" ? (
          <>
            <h2 id="onboarding-title" className="text-lg font-semibold text-white">Welcome to Jobaton</h2>
            <p className="mt-2 text-sm text-[#aaa]">Start with your resume. We'll fill in your profile from it, and every tool (ATS score, tailoring, cover letters, interview prep) works from it.</p>
            {!aiReady && (
              <div className="mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] text-xs text-amber-200">
                Reading your resume uses your AI provider, and no API key is set yet.{" "}
                <button className="underline font-medium" onClick={() => { setPhase("none"); navigate("/settings"); }}>Add one in Settings</button>, then reload this page.
              </div>
            )}
            <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!!busy || !aiReady}
              className="glass-btn-primary mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><Upload className="h-4 w-4" /> Upload resume (PDF)</>}
            </button>
            <button onClick={() => setPhase("offer")} disabled={!!busy} className="mt-3 w-full text-xs text-[#888] hover:text-white disabled:opacity-50">
              Skip for now
            </button>
          </>
        ) : (
          <>
            <h2 id="onboarding-title" className="text-lg font-semibold text-white">{filledFrom ? "Your profile is filled in" : "Want a quick tour?"}</h2>
            {filledFrom && <p className="mt-2 text-sm text-[#aaa]">We read {filledFrom === "your resume" ? "your resume" : `${filledFrom}'s resume`} and filled in your profile. You can check it on the Profile page any time.</p>}
            <p className="mt-2 text-sm text-[#aaa]">The tour takes about a minute and walks through a sample job step by step, so you can see what each tool does.</p>
            <button onClick={begin} className="glass-btn-primary mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg">
              <Compass className="h-4 w-4" /> Start the tour
            </button>
            {/* After an upload the page behind still shows the empty state, so reload it. */}
            <button onClick={async () => { await markDone(); if (filledFrom) window.location.reload(); }} className="mt-3 w-full text-xs text-[#888] hover:text-white">Skip the tour</button>
          </>
        )}
      </div>
    </div>
  );
}

function TourStep({ step, onBack, onNext, onSkip }: { step: number; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const s = STEPS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The target may appear only after the route loads, so keep looking for it.
  useLayoutEffect(() => {
    setRect(null);
    if (!s.target) return;
    let scrolled = false;
    const find = () => {
      const el = document.querySelector(s.target!);
      if (!el) return;
      if (!scrolled) { el.scrollIntoView({ block: "center" }); scrolled = true; }
      setRect(el.getBoundingClientRect());
    };
    find();
    const t = setInterval(find, 250);
    window.addEventListener("resize", find);
    window.addEventListener("scroll", find, true);
    return () => { clearInterval(t); window.removeEventListener("resize", find); window.removeEventListener("scroll", find, true); };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft" && step > 0) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onNext, onBack, onSkip]);

  const pad = 6;
  const cardW = Math.min(360, window.innerWidth - 32);
  // Card below the target when there is room, otherwise above it; centred when there is no target.
  const below = rect && rect.bottom + 220 < window.innerHeight;
  const cardStyle: React.CSSProperties = rect
    ? {
        left: Math.max(16, Math.min(rect.left, window.innerWidth - cardW - 16)),
        ...(below ? { top: rect.bottom + pad + 10 } : { bottom: Math.max(16, window.innerHeight - rect.top + pad + 10) }),
        width: cardW,
      }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: cardW };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div
          className="fixed rounded-lg pointer-events-none transition-all duration-200"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: Math.min(rect.height, window.innerHeight * 0.7) + pad * 2, boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)", border: "2px solid #028FA2" }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/65" />
      )}
      <div className="fixed rounded-xl border border-white/10 bg-[#141414] p-4 shadow-2xl" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <h3 id="tour-title" className="text-sm font-semibold text-white">{s.title}</h3>
          <button onClick={onSkip} aria-label="Skip the tour" className="text-[#666] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[#aaa]">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[0.667rem] text-[#555]">{step + 1} of {STEPS.length}</span>
          <div className="flex items-center gap-2">
            <button onClick={onSkip} className="px-2 py-1 text-xs text-[#888] hover:text-white">Skip tour</button>
            {step > 0 && <button onClick={onBack} className="px-3 py-1.5 text-xs rounded-md border border-white/10 text-[#ccc] hover:text-white">Back</button>}
            <button onClick={onNext} className="glass-btn-primary px-3 py-1.5 text-xs font-medium rounded-md">{step === STEPS.length - 1 ? "Finish" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
