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
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashStats>({ resumes: 0, jobs: 0, profileComplete: false, statusBreakdown: {}, prepProgress: { ats: 0, tailor: 0, cover: 0, study: 0, interview: 0 } });
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
      });
      setLoading(false);
    });
  }, []);

  const steps = [
    {
      done: stats.resumes > 0,
      title: "Upload your resume",
      desc: "Start by uploading a PDF — AI will parse and structure it automatically.",
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

      {/* Getting Started — dismissible */}
      {!gettingStartedDismissed && (
        <>
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-medium text-white">Getting Started</h2>
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
                      <h3 className={`text-[13px] font-medium ${step.done ? "text-[#666] line-through" : "text-white"}`}>{step.title}</h3>
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
      {!loading && (stats.resumes > 0 || stats.jobs > 0) && (
        <div className="space-y-6">
          {/* Stat row */}
          <div className="grid grid-cols-3 gap-4">
            <Link to="/resume" className="glass-card p-5 group transition-all border-l-2 border-l-[#028FA2]/50">
              <p className="text-2xl font-semibold text-[#2dd4bf]">{stats.resumes}</p>
              <p className="text-xs text-[#666] mt-1">Base resumes</p>
            </Link>
            <Link to="/jobs" className="glass-card p-5 group transition-all border-l-2 border-l-amber-500/50">
              <p className="text-2xl font-semibold text-amber-400">{stats.jobs}</p>
              <p className="text-xs text-[#666] mt-1">Jobs tracked</p>
            </Link>
            <Link to="/profile" className="glass-card p-5 group transition-all border-l-2 border-l-green-500/50">
              <p className={`text-2xl font-semibold ${stats.profileComplete ? "text-green-400" : "text-[#666]"}`}>{stats.profileComplete ? "✓" : "—"}</p>
              <p className="text-xs text-[#666] mt-1">{stats.profileComplete ? "Profile complete" : "Incomplete"}</p>
            </Link>
          </div>

          {/* Pipeline — circles */}
          {stats.jobs > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-[13px] font-medium text-white mb-4">Pipeline</h3>
              <div className="flex items-center justify-between gap-2">
                {[
                  { key: "saved", label: "Saved", color: "#a1a1aa" },
                  { key: "applied", label: "Applied", color: "#028FA2" },
                  { key: "interviewing", label: "Interview", color: "#eab308" },
                  { key: "offered", label: "Offered", color: "#22c55e" },
                  { key: "rejected", label: "Rejected", color: "#ef4444" },
                  { key: "withdrawn", label: "Withdrawn", color: "#6b7280" },
                ].map(({ key, label, color }) => {
                  const count = stats.statusBreakdown[key] || 0;
                  return (
                    <div key={key} className="flex flex-col items-center gap-1.5">
                      <div className="relative w-12 h-12">
                        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/[0.06]" />
                          <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="3" strokeDasharray={`${stats.jobs > 0 ? (count / stats.jobs) * 125.6 : 0} 125.6`} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">{count}</span>
                      </div>
                      <p className="text-[10px] text-[#666]">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Prep Progress */}
          {stats.jobs > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-medium text-white">Prep Progress</h3>
                <span className="text-xs text-[#555]">{stats.prepProgress.ats + stats.prepProgress.tailor + stats.prepProgress.cover + stats.prepProgress.study + stats.prepProgress.interview}/{stats.jobs * 5}</span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "ATS", count: stats.prepProgress.ats, icon: ScanSearch },
                  { label: "Resume", count: stats.prepProgress.tailor, icon: FileText },
                  { label: "Cover", count: stats.prepProgress.cover, icon: Sparkles },
                  { label: "Study", count: stats.prepProgress.study, icon: BookOpen },
                  { label: "Interview", count: stats.prepProgress.interview, icon: MessageSquare },
                ].map(({ label, count, icon: Icon }) => (
                  <div key={label} className="text-center">
                    <Icon className="h-4 w-4 mx-auto text-[#666] mb-1" />
                    <p className="text-sm font-semibold text-white">{count}/{stats.jobs}</p>
                    <p className="text-[10px] text-[#555]">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions — compact */}
          {stats.jobs > 0 && (
            <Link to="/jobs" className="inline-flex items-center gap-2 px-4 py-2 glass-card group transition-all">
              <TrendingUp className="h-3.5 w-3.5 text-[#028FA2] shrink-0" />
              <span className="text-xs font-medium text-white">Continue where you left off</span>
              <span className="text-[10px] text-[#555]">({stats.jobs - (stats.statusBreakdown["offered"] || 0) - (stats.statusBreakdown["rejected"] || 0) - (stats.statusBreakdown["withdrawn"] || 0)} active)</span>
              <ArrowRight className="h-3 w-3 text-[#555] group-hover:text-white transition-colors" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
