import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, Briefcase, User, Upload, ArrowRight, CheckCircle2, ScanSearch, Sparkles, BookOpen, MessageSquare, TrendingUp, Target, Zap } from "lucide-react";
import { api } from "@/lib/api";

interface DashStats {
  resumes: number;
  jobs: number;
  profileComplete: boolean;
  statusBreakdown: Record<string, number>;
  prepProgress: { ats: number; tailor: number; cover: number; study: number; interview: number };
  recent: { id: string; title?: string; company?: string; status: string }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashStats>({ resumes: 0, jobs: 0, profileComplete: false, statusBreakdown: {}, prepProgress: { ats: 0, tailor: 0, cover: 0, study: 0, interview: 0 }, recent: [] });
  const [loading, setLoading] = useState(true);
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(() => localStorage.getItem("jobaton_gs_dismissed") === "true");

  useEffect(() => {
    Promise.all([
      api.getResumes().catch(() => []),
      api.getJobs().catch(() => []),
      api.getProfile().catch(() => null),
    ]).then(([resumes, jobs, profile]) => {
      const hasProfile = !!(profile?.headline?.trim() && profile?.skills?.trim() && profile?.location?.trim());
      const jobList = jobs || [];
      const statusBreakdown: Record<string, number> = {};
      let ats = 0, tailor = 0, cover = 0, study = 0, interview = 0;
      for (const j of jobList) {
        statusBreakdown[j.status] = (statusBreakdown[j.status] || 0) + 1;
        const p = j.prep_data || {};
        if (p.ats) ats++;
        if (p.tailor) tailor++;
        if (p.cover_letter) cover++;
        if (p.study_guide) study++;
        if (p.interview) interview++;
      }
      setStats({
        resumes: (resumes || []).length,
        jobs: jobList.length,
        profileComplete: hasProfile,
        statusBreakdown,
        prepProgress: { ats, tailor, cover, study, interview },
        recent: jobList.slice(0, 3), // API returns jobs newest-updated first
      });
      setLoading(false);
    });
  }, []);

  const steps = [
    {
      done: stats.resumes > 0,
      title: "Upload your resume",
      desc: "Start by uploading a PDF. AI will parse and structure it automatically.",
      action: "/resume",
      actionLabel: "Go to Resumes",
      icon: Upload,
    },
    {
      done: stats.profileComplete,
      title: "Complete your profile",
      desc: "Your profile powers job search recommendations. It can be auto-filled from your resume.",
      action: "/profile",
      actionLabel: "Go to Profile",
      icon: User,
    },
    {
      done: stats.jobs > 0,
      title: "Add your first job",
      desc: "Paste a job description and AI will extract all the details for you.",
      action: "/jobs",
      actionLabel: "Go to Jobs",
      icon: Briefcase,
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-[#666] mt-0.5">Your self-hosted AI career toolkit overview.</p>
      </div>

      {/* Getting Started - dismissible */}
      {!gettingStartedDismissed && (
        <>
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[0.867rem] font-medium text-white">Getting Started</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#666]">{completedSteps}/{steps.length}</span>
                {completedSteps === steps.length && (
                  <button onClick={() => { setGettingStartedDismissed(true); localStorage.setItem("jobaton_gs_dismissed", "true"); }} className="text-xs text-[#666] hover:text-white transition-colors">
                    Dismiss
                  </button>
                )}
              </div>
            </div>
            <div className="w-full bg-white/[0.06] rounded-full h-1">
              <div className="bg-[#028FA2] h-1 rounded-full transition-all duration-500" style={{ width: `${(completedSteps / steps.length) * 100}%` }} />
            </div>
          </div>

          <div className="space-y-2 mb-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className={`glass-card p-4 transition-all ${step.done ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-3">
                    {step.done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <Icon className="h-4 w-4 text-[#888] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-[0.867rem] font-medium ${step.done ? "text-[#666] line-through" : "text-white"}`}>{step.title}</h3>
                      <p className="text-xs text-[#555] mt-0.5">{step.desc}</p>
                    </div>
                    {!step.done && (
                      <Link to={step.action} className="text-xs font-medium text-[#028FA2] hover:underline shrink-0">
                        {step.actionLabel}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Stats */}
      {!loading && (stats.resumes > 0 || stats.jobs > 0) && (() => {
        const active = stats.jobs - (stats.statusBreakdown["offered"] || 0) - (stats.statusBreakdown["rejected"] || 0) - (stats.statusBreakdown["withdrawn"] || 0);
        const prepDone = stats.prepProgress.ats + stats.prepProgress.tailor + stats.prepProgress.cover + stats.prepProgress.study + stats.prepProgress.interview;
        const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
        const statCards = [
          { to: "/resume", icon: FileText, color: "#028FA2", value: String(stats.resumes), label: "Base resumes", hint: "Manage resumes" },
          { to: "/jobs", icon: Briefcase, color: "#f59e0b", value: String(stats.jobs), label: "Jobs tracked", hint: "View all jobs" },
          { to: "/jobs", icon: Target, color: "#8b5cf6", value: String(active), label: "Active applications", hint: "Saved, applied or interviewing" },
          { to: "/profile", icon: User, color: stats.profileComplete ? "#22c55e" : "#a1a1aa", value: stats.profileComplete ? "Complete" : "Incomplete", label: "Profile", hint: stats.profileComplete ? "Edit profile" : "Finish your profile" },
        ];
        const pipeline = [
          { key: "saved", label: "Saved", color: "#a1a1aa" },
          { key: "applied", label: "Applied", color: "#028FA2" },
          { key: "interviewing", label: "Interviewing", color: "#eab308" },
          { key: "offered", label: "Offered", color: "#22c55e" },
          { key: "rejected", label: "Rejected", color: "#ef4444" },
          { key: "withdrawn", label: "Withdrawn", color: "#6b7280" },
        ];
        const prep = [
          { label: "ATS scan", count: stats.prepProgress.ats, icon: ScanSearch },
          { label: "Tailored resume", count: stats.prepProgress.tailor, icon: FileText },
          { label: "Cover letter", count: stats.prepProgress.cover, icon: Sparkles },
          { label: "Study guide", count: stats.prepProgress.study, icon: BookOpen },
          { label: "Interview prep", count: stats.prepProgress.interview, icon: MessageSquare },
        ];
        const track = "rgba(128,128,128,0.15)";
        return (
        <div className="space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ to, icon: Icon, color, value, label, hint }) => (
              <Link key={label} to={to} className="glass-card p-5 group transition-all hover:-translate-y-0.5">
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: `${color}1f` }}>
                    <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-[#555] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                </div>
                <p className="text-2xl font-semibold text-white mt-4 leading-none">{value}</p>
                <p className="text-xs font-medium text-[#888] mt-1.5">{label}</p>
                <p className="text-[0.667rem] text-[#555] mt-0.5">{hint}</p>
              </Link>
            ))}
          </div>

          {stats.jobs > 0 && (
            <div className="grid lg:grid-cols-5 gap-4">
              {/* Pipeline */}
              <div className="glass-card p-5 lg:col-span-3">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-[0.867rem] font-medium text-white">Application pipeline</h3>
                  <span className="text-xs text-[#555]">{stats.jobs} jobs</span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden mb-5" style={{ background: track }} role="img"
                  aria-label={pipeline.map(({ key, label }) => `${label} ${stats.statusBreakdown[key] || 0}`).join(", ")}>
                  {pipeline.map(({ key, color }) => {
                    const count = stats.statusBreakdown[key] || 0;
                    return count > 0 ? <div key={key} style={{ width: `${pct(count, stats.jobs)}%`, background: color }} /> : null;
                  })}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {pipeline.map(({ key, label, color }) => {
                    const count = stats.statusBreakdown[key] || 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-[0.667rem] text-[#666] truncate">{label}</span>
                        </div>
                        <p className="text-lg font-semibold text-white mt-1 leading-none">{count}</p>
                        <p className="text-[0.667rem] text-[#555] mt-1">{pct(count, stats.jobs)}%</p>
                      </div>
                    );
                  })}
                </div>

                <h4 className="text-[0.667rem] font-medium uppercase tracking-wider text-[#555] mt-6 mb-2">Recently updated</h4>
                <ul className="divide-y divide-[rgba(128,128,128,0.12)]">
                  {stats.recent.map((job) => {
                    const st = pipeline.find((p) => p.key === job.status);
                    return (
                      <li key={job.id}>
                        <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 py-2 group">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: st?.color || "#a1a1aa" }} />
                          <span className="flex-1 min-w-0 truncate text-xs text-white">
                            {job.title || "Untitled job"}{job.company && <span className="text-[#666]"> at {job.company}</span>}
                          </span>
                          <span className="text-[0.667rem] text-[#555] shrink-0">{st?.label || job.status}</span>
                          <ArrowRight className="h-3 w-3 text-[#555] group-hover:text-[#028FA2] transition-colors shrink-0" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Prep progress */}
              <div className="glass-card p-5 lg:col-span-2">
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-[0.867rem] font-medium text-white">Prep progress</h3>
                  <span className="text-xs text-[#555]">{pct(prepDone, stats.jobs * 5)}% done</span>
                </div>
                <div className="space-y-3">
                  {prep.map(({ label, count, icon: Icon }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-xs text-[#888]"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</span>
                        <span className="text-[0.667rem] text-[#555]">{count}/{stats.jobs}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: track }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct(count, stats.jobs)}%`, background: "#028FA2" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Continue */}
          {stats.jobs > 0 && (
            <Link to="/jobs" className="glass-card p-4 flex items-center gap-3 group transition-all">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[#028FA2]/10 shrink-0">
                <TrendingUp className="h-4 w-4 text-[#028FA2]" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[0.867rem] font-medium text-white">Continue where you left off</p>
                <p className="text-xs text-[#555]">{active} active {active === 1 ? "application" : "applications"} to prepare for</p>
              </div>
              <ArrowRight className="h-4 w-4 text-[#555] group-hover:text-[#028FA2] group-hover:translate-x-0.5 transition-all" aria-hidden="true" />
            </Link>
          )}
        </div>
        );
      })()}
    </div>
  );
}
