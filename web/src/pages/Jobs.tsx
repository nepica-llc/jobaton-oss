import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Briefcase, Plus, Trash2, X, ExternalLink, Loader2, Sparkles, ArrowRight, Search, AlertCircle, User, FileText, LayoutGrid, List, ScanSearch, BookOpen, MessageSquare, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const STATUSES = [
  { key: "saved", label: "Saved", color: "bg-white/[0.04] text-[#888] border border-white/10" },
  { key: "applied", label: "Applied", color: "bg-[#028FA2]/10 text-[#028FA2] border border-[#028FA2]/20" },
  { key: "interviewing", label: "Interviewing", color: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  { key: "offered", label: "Offered", color: "bg-green-500/10 text-green-400 border border-green-500/20" },
  { key: "rejected", label: "Rejected", color: "bg-red-500/10 text-red-400 border border-red-500/20" },
  { key: "withdrawn", label: "Withdrawn", color: "bg-white/[0.04] text-[#666] border border-white/10" },
];

interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  url?: string;
  salary?: string;
  notes?: string;
  status: string;
  applied_date?: string;
  raw_description?: string;
  requirements?: string[];
  nice_to_have?: string[];
  description_summary?: string;
  created_at?: string;
  updated_at?: string;
}

type ViewMode = "my-jobs" | "search";
type SortKey = "title" | "company" | "status" | "created_at";
type SortDir = "asc" | "desc";

function PrepDots({ prep }: { prep: any }) {
  const items = [
    { key: "ats", icon: ScanSearch, label: "ATS" },
    { key: "tailor", icon: FileText, label: "Resume" },
    { key: "cover_letter", icon: Sparkles, label: "Cover" },
    { key: "study_guide", icon: BookOpen, label: "Study" },
    { key: "interview", icon: MessageSquare, label: "Interview" },
  ];
  return (
    <div className="flex items-center gap-1">
      {items.map(({ key, icon: Icon, label }) => (
        <span key={key} title={label} className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${prep[key] ? "bg-green-500/10 text-green-400" : "bg-white/[0.04] text-[#555]"}`}>
          <Icon className="h-3 w-3" />
        </span>
      ))}
    </div>
  );
}

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("my-jobs");
  const [rawJD, setRawJD] = useState("");
  const [parsing, setParsing] = useState(false);
  const [jobViewMode, setJobViewMode] = useState<"list" | "tile">(() => (localStorage.getItem("jobaton_job_view") as any) || "list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleJobView = (mode: "list" | "tile") => { setJobViewMode(mode); localStorage.setItem("jobaton_job_view", mode); };
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    loadJobs();
    api.getResumes().then((data: any) => {
      const list = data || [];
      setResumes(list);
      if (list.length > 0) setSelectedResumeId(list[0].id);
    }).catch(() => {});
  }, []);

  const loadJobs = async () => {
    try {
      const data = await api.getJobs();
      setJobs(data || []);
    } catch { /* ignore */ }
  };

  const filteredJobs = useMemo(() => {
    let list = filterStatus === "all" ? jobs : jobs.filter((j) => j.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        (j.location || "").toLowerCase().includes(q) ||
        (j.description_summary || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const av = (a as any)[sortKey] || "";
      const bv = (b as any)[sortKey] || "";
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [jobs, filterStatus, searchQuery, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 text-gray-300" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-[#028FA2]" /> : <ChevronDown className="h-3 w-3 text-[#028FA2]" />;
  };

  const handleParseAndAdd = async () => {
    if (!rawJD.trim()) { toast.error("Paste a job description first"); return; }
    setParsing(true);
    try {
      const parsed = await api.parseJob(rawJD);
      const job = await api.createJob({
        title: parsed.title || "Untitled Role",
        company: parsed.company || "Unknown",
        location: parsed.location || "",
        salary: parsed.salary || "",
        requirements: parsed.requirements || [],
        nice_to_have: parsed.nice_to_have || [],
        description_summary: parsed.description_summary || "",
        raw_description: rawJD,
        status: "saved",
        resume_id: selectedResumeId || undefined,
      });
      setJobs((prev) => [job, ...prev]);
      setRawJD("");
      setShowForm(false);
      toast.success(`Added: ${job.title} at ${job.company}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success("Job removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, job: Job) => {
    e.stopPropagation();
    try {
      const updated = await api.updateJob(job.id, { ...job, status: e.target.value });
      setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const checkProfileAndSearch = async () => {
    setViewMode("search");
    if (profileChecked) return;
    try {
      const p = await api.getProfile();
      setProfile(p);
      setProfileChecked(true);
    } catch {
      setProfileChecked(true);
    }
  };

  const [jobspyResults, setJobspyResults] = useState<any[]>([]);
  const [jobspyCached, setJobspyCached] = useState(false);
  const [jobspySearchTerm, setJobspySearchTerm] = useState("");
  const [jobspyLocation, setJobspyLocation] = useState("");

  const handleSearchJobs = async (p?: any) => {
    const prof = p || profile;
    setSearching(true);
    try {
      const results = await api.searchJobs({
        title: prof?.title || prof?.headline || "",
        skills: prof?.skills || "",
        location: prof?.location || "",
        experience: prof?.experience || "",
        preferences: prof?.preferences || "",
      });
      setSearchResults(results || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleJobspyScan = async (forceRefresh = false) => {
    const term = jobspySearchTerm || profile?.headline || "software engineer";
    const loc = jobspyLocation || profile?.location || "";
    setSearching(true);
    try {
      const result = await api.jobspySearch(term, loc, 20, forceRefresh);
      setJobspyResults(result.jobs || []);
      setJobspyCached(result.cached || false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const profileIncomplete = profileChecked && (!profile?.headline?.trim() || !profile?.skills?.trim() || !profile?.location?.trim());
  const missingFields = profileChecked ? [
    !profile?.headline?.trim() && "Headline/Title",
    !profile?.skills?.trim() && "Skills",
    !profile?.location?.trim() && "Location",
    !profile?.experience?.trim() && "Experience Level",
  ].filter(Boolean) : [];

  const statusCounts = STATUSES.map((s) => ({
    ...s,
    count: jobs.filter((j) => j.status === s.key).length,
  }));

  return (
    <div className="animate-fade-in max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Jobs</h1>
          <p className="text-sm text-[#666] mt-0.5">Track applications and discover opportunities.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
          <Plus className="h-3.5 w-3.5" /> Add Job
        </button>
      </div>

      {/* Stats tiles — glass, transparent highlight */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-6">
        <button onClick={() => { setFilterStatus("all"); setViewMode("my-jobs"); }} className={`px-3 py-3 rounded-xl text-center text-xs font-medium transition-all ${filterStatus === "all" && viewMode === "my-jobs" ? "glass-stat-active text-[#028FA2]" : "glass-stat text-[#888] hover:shadow-sm"}`}>
          All <span className="block text-xl font-bold mt-0.5">{jobs.length}</span>
        </button>
        {statusCounts.map((s) => (
          <button key={s.key} onClick={() => { setFilterStatus(s.key); setViewMode("my-jobs"); }} className={`px-3 py-3 rounded-xl text-center text-xs font-medium transition-all ${filterStatus === s.key && viewMode === "my-jobs" ? "glass-stat-active text-[#028FA2]" : "glass-stat text-[#888] hover:shadow-sm"}`}>
            {s.label} <span className="block text-xl font-bold mt-0.5">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Tab toggle: My Jobs / Search Jobs */}
      <div className="flex gap-1 mb-5 border-b border-white/[0.06] pb-0">
        <button
          onClick={() => setViewMode("my-jobs")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all ${viewMode === "my-jobs" ? "border-[#028FA2] text-[#028FA2]" : "border-transparent text-[#555] hover:text-white"}`}
        >
          <Briefcase className="h-3.5 w-3.5" /> My Jobs
        </button>
        <button
          onClick={checkProfileAndSearch}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all ${viewMode === "search" ? "border-[#028FA2] text-[#028FA2]" : "border-transparent text-[#555] hover:text-white"}`}
        >
          <Search className="h-3.5 w-3.5" /> Search Jobs
        </button>
      </div>

      {/* Add Job — paste JD with resume selector */}
      {showForm && (
        <div className="glass-card rounded-lg p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#028FA2]" />
              <h3 className="text-sm font-semibold text-white">Paste Job Description</h3>
            </div>
            <button onClick={() => { setShowForm(false); setRawJD(""); }} className="p-1.5 text-[#555] hover:text-white glass-btn rounded-lg"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-[#888] mb-3">Paste the full job posting and select your base resume. AI will extract job details automatically.</p>

          {/* Resume selector */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-[#888] mb-1">Base Resume</label>
            {resumes.length > 0 ? (
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                className="glass-input w-full px-3 py-2 rounded-xl text-sm"
              >
                {resumes.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name || r.fullName || "Untitled Resume"}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-200/60 rounded-xl backdrop-blur-sm">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-amber-400">No resumes found. <Link to="/resume" className="text-[#028FA2] hover:underline font-medium">Upload a resume first</Link> for best results.</p>
                </div>
              </div>
            )}
          </div>

          <textarea
            value={rawJD}
            onChange={(e) => setRawJD(e.target.value)}
            rows={8}
            placeholder="Paste the full job description here..."
            className="glass-input w-full px-3 py-2 rounded-xl text-sm resize-y font-mono"
          />
          <div className="flex justify-end mt-3">
            <button
              onClick={handleParseAndAdd}
              disabled={parsing || !rawJD.trim()}
              className="glass-btn-primary flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl disabled:opacity-50"
            >
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {parsing ? "Parsing with AI..." : "Parse & Add Job"}
            </button>
          </div>
        </div>
      )}

      {/* ─── VIEW: My Jobs ─── */}
      {viewMode === "my-jobs" && (
        <>
          {/* Search + view toggle bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#555]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs by title, company, or location..."
                className="glass-input w-full pl-9 pr-3 py-2 rounded-xl text-sm"
              />
            </div>
            <div className="flex items-center gap-0.5 glass rounded-xl p-0.5">
              <button onClick={() => toggleJobView("list")} className={`p-1.5 rounded-lg transition-all ${jobViewMode === "list" ? "glass-stat-active text-[#028FA2]" : "text-[#555] hover:text-white"}`}>
                <List className="h-4 w-4" />
              </button>
              <button onClick={() => toggleJobView("tile")} className={`p-1.5 rounded-lg transition-all ${jobViewMode === "tile" ? "glass-stat-active text-[#028FA2]" : "text-[#555] hover:text-white"}`}>
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="glass-card flex flex-col items-center justify-center rounded-lg p-12">
              <Briefcase className="h-10 w-10 text-gray-300 mb-2" />
              <p className="text-sm text-[#555]">{searchQuery ? "No jobs match your search." : filterStatus === "all" ? "No jobs tracked yet. Click 'Add Job' to paste a requirement." : `No jobs with status "${filterStatus}".`}</p>
            </div>
          ) : jobViewMode === "tile" ? (
            /* ── Tile View ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredJobs.map((job) => {
                const statusInfo = STATUSES.find((s) => s.key === job.status) || STATUSES[0];
                const prep = (job as any).prep_data || {};
                return (
                  <div
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    className="glass-card rounded-lg p-4 cursor-pointer group flex flex-col transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <select
                        value={job.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(e, job)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border-0 cursor-pointer ${statusInfo.color}`}
                      >
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                      <button onClick={(e) => handleDelete(e, job.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#028FA2] transition-colors">{job.title}</h3>
                    <p className="text-xs text-[#888] mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ""}</p>
                    {job.description_summary && <p className="text-[10px] text-[#555] mt-1.5 line-clamp-2">{job.description_summary}</p>}
                    <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-white/[0.06]">
                      <PrepDots prep={prep} />
                      {prep.ats?.score && (
                        <span className={`ml-auto text-[10px] font-bold ${prep.ats.score >= 80 ? "text-green-600" : prep.ats.score >= 60 ? "text-amber-600" : "text-red-600"}`}>{prep.ats.score}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Table View ── */
            <div className="glass-card rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {([["title", "Job Title"], ["company", "Company"], ["status", "Status"]] as [SortKey, string][]).map(([key, label]) => (
                        <th key={key} onClick={() => toggleSort(key)} className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none">
                          <span className="flex items-center gap-1">{label} <SortIcon col={key} /></span>
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Prep</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">ATS</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredJobs.map((job) => {
                      const statusInfo = STATUSES.find((s) => s.key === job.status) || STATUSES[0];
                      const prep = (job as any).prep_data || {};
                      return (
                        <tr
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-semibold text-white truncate max-w-[240px] group-hover:text-[#028FA2] transition-colors">{job.title}</span>
                              {job.url && (
                                <a href={job.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-gray-300 hover:text-[#028FA2] shrink-0">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#888] font-medium">{job.company}</td>
                          <td className="px-4 py-3">
                            <select
                              value={job.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleStatusChange(e, job)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border-0 cursor-pointer ${statusInfo.color}`}
                            >
                              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#555]">{job.location || "—"}</td>
                          <td className="px-4 py-3">
                            <PrepDots prep={prep} />
                          </td>
                          <td className="px-4 py-3">
                            {prep.ats?.score ? (
                              <span className={`text-xs font-bold ${prep.ats.score >= 80 ? "text-green-600" : prep.ats.score >= 60 ? "text-amber-600" : "text-red-600"}`}>{prep.ats.score}%</span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={(e) => handleDelete(e, job.id)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <ArrowRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-[#028FA2] transition-colors" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Row count footer */}
              <div className="px-4 py-2 border-t border-white/[0.04] text-[10px] text-[#555] flex items-center justify-between">
                <span>Showing {filteredJobs.length} of {jobs.length} jobs</span>
                {searchQuery && <button onClick={() => setSearchQuery("")} className="text-[#028FA2] hover:underline">Clear search</button>}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── VIEW: Search Jobs ─── */}
      {viewMode === "search" && (
        <div className="space-y-4">
          {/* Search controls */}
          <div className="glass-card rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-medium text-white">Find Real Jobs</h3>
              {jobspyCached && <span className="text-[10px] text-[#555] bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-md">Cached results</span>}
            </div>

            <div className="flex gap-2 mb-3">
              <input
                value={jobspySearchTerm}
                onChange={(e) => setJobspySearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJobspyScan()}
                placeholder={profile?.headline || "Job title, e.g. Software Engineer"}
                className="glass-input flex-1 px-3 py-2 rounded-lg text-sm"
              />
              <input
                value={jobspyLocation}
                onChange={(e) => setJobspyLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJobspyScan()}
                placeholder={profile?.location || "Location (optional)"}
                className="glass-input w-44 px-3 py-2 rounded-lg text-sm"
              />
              <button onClick={() => handleJobspyScan()} disabled={searching} className="glass-btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 shrink-0">
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Scan
              </button>
              {jobspyResults.length > 0 && (
                <button onClick={() => handleJobspyScan(true)} disabled={searching} className="glass-btn flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg disabled:opacity-50 shrink-0" title="Force refresh (bypass cache)">
                  ↻ New Scan
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#555]">Powered by <a href="https://github.com/speedyapply/JobSpy" target="_blank" rel="noopener noreferrer" className="text-[#028FA2] hover:underline">JobSpy</a> — scrapes Indeed, LinkedIn, Glassdoor. Results cached for 6 hours.</p>
          </div>

          {/* Results */}
          {searching ? (
            <div className="glass-card rounded-lg p-12 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#028FA2] mx-auto mb-2" />
              <p className="text-sm text-[#888]">Scanning job boards...</p>
            </div>
          ) : jobspyResults.length > 0 ? (
            <div className="glass-card rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-xs text-[#888]">{jobspyResults.length} jobs found</span>
              </div>
              <div className="divide-y divide-white/[0.04]">
                {jobspyResults.map((job, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-medium text-white truncate">{job.title}</p>
                          {job.site && <span className="text-[9px] text-[#555] bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded shrink-0">{job.site}</span>}
                        </div>
                        <p className="text-xs text-[#888] mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ""}{job.salary ? ` · ${job.salary}` : ""}</p>
                        {job.description && <p className="text-[11px] text-[#555] mt-1 line-clamp-2">{job.description}</p>}
                      </div>
                      {job.url && (
                        <a href={job.url} target="_blank" rel="noopener noreferrer" className="glass-btn px-2.5 py-1 text-[10px] text-[#028FA2] rounded-md font-medium shrink-0 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-card rounded-lg p-8 text-center">
              <Search className="h-6 w-6 text-[#555] mx-auto mb-2" />
              <p className="text-sm text-[#888] mb-1">Enter a job title and click Scan</p>
              <p className="text-xs text-[#555]">We'll search Indeed, LinkedIn, and Glassdoor for real job listings.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
