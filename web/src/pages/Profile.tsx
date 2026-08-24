import { useState, useEffect } from "react";
import { User, Save, Loader2, FileText, Sparkles, Check, X, Pencil, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resumes, setResumes] = useState<any[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    headline: "",
    skills: "",
    experience: "",
    preferences: "",
  });

  useEffect(() => {
    Promise.all([
      api.getProfile().catch(() => null),
      api.getResumes().catch(() => []),
    ]).then(([data, resumeData]) => {
      if (data) setForm((prev) => ({ ...prev, ...data }));
      const list = resumeData || [];
      setResumes(list);
      if (list.length > 0) setSelectedResumeId(list[0].id);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveProfile(form);
      toast.success("Profile saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inferExperienceLevel = (experience: any[]): string => {
    if (!experience?.length) return "";
    const now = new Date().getFullYear();
    let totalYears = 0;
    for (const exp of experience) {
      const start = parseInt(exp.startDate) || now;
      const end = exp.endDate?.toLowerCase() === "present" ? now : (parseInt(exp.endDate) || now);
      totalYears += Math.max(0, end - start);
    }
    if (totalYears <= 2) return "Entry-level (0-2 years)";
    if (totalYears <= 5) return "Mid-level (3-5 years)";
    if (totalYears <= 10) return "Senior (6-10 years)";
    return "Staff/Principal (10+ years)";
  };

  const handleImportFromResume = () => {
    const resume = resumes.find((r) => r.id === selectedResumeId);
    if (!resume) return;
    const expLevel = inferExperienceLevel(resume.experience);
    setForm((prev) => ({
      ...prev,
      fullName: resume.fullName || prev.fullName,
      email: resume.email || prev.email,
      phone: resume.phone || prev.phone,
      location: resume.location || prev.location,
      linkedin: resume.linkedin || prev.linkedin,
      github: resume.github || prev.github,
      portfolio: resume.portfolio || prev.portfolio,
      headline: resume.experience?.[0]?.title || prev.headline,
      skills: (resume.skills || []).join(", ") || prev.skills,
      experience: expLevel || prev.experience,
    }));
    setShowImportModal(false);
    toast.success("Profile populated from resume! Review and save.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#028FA2]" />
      </div>
    );
  }

  const inputClass = editing
    ? "w-full px-3 py-2 border border-white/10 bg-[#0a0a0a] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#028FA2]/20 focus:border-[#028FA2] transition-colors"
    : "w-full px-3 py-2 border border-white/[0.04] bg-white/[0.03] rounded-lg text-sm text-[#ccc] cursor-default";

  return (
    <div className="animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Profile</h1>
        <p className="text-sm text-[#666] mt-0.5">Personal info, base resume, and job search preferences — stored locally.</p>
      </div>

      {/* Import from resume banner */}
      {resumes.length > 0 && !form.fullName && (
        <div className="mb-5 p-4 bg-[#028FA2]/10 border border-[#028FA2]/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-[#028FA2] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white">Auto-fill from your resume?</h4>
              <p className="text-xs text-[#888] mt-0.5">We can populate your profile using data from an uploaded resume. Save time!</p>
              <button onClick={() => setShowImportModal(true)} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#028FA2] rounded-lg hover:bg-[#027a8c] transition-colors">
                <FileText className="h-3 w-3" /> Import from Resume
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#028FA2]/10 rounded-full flex items-center justify-center">
              <User className="h-6 w-6 text-[#028FA2]" />
            </div>
            <div>
              <p className="font-semibold text-white">{form.fullName || "Your Name"}</p>
              <p className="text-sm text-[#888]">{form.headline || "Add a headline"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {resumes.length > 0 && editing && (
              <button onClick={() => setShowImportModal(true)} className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
                <FileText className="h-3 w-3" /> Fill from Resume
              </button>
            )}
            {!editing && (
              <button onClick={() => setEditing(true)} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1">Full Name</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="John Doe" className={inputClass} readOnly={!editing} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1">Headline</label>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Senior Software Engineer" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="New York, NY" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">LinkedIn</label>
            <input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">GitHub</label>
            <input value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} placeholder="https://github.com/..." className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Portfolio</label>
            <input value={form.portfolio} onChange={(e) => setForm({ ...form, portfolio: e.target.value })} placeholder="https://yoursite.com" className={inputClass} readOnly={!editing} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1">Skills (used for job search)</label>
            <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, Node.js, Python, AWS, Docker..." className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Experience Level</label>
            <select value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className={`${inputClass} ${editing ? 'bg-white' : 'bg-gray-50'}`} disabled={!editing}>
              <option value="">Select...</option>
              <option value="Entry-level (0-2 years)">Entry-level (0-2 years)</option>
              <option value="Mid-level (3-5 years)">Mid-level (3-5 years)</option>
              <option value="Senior (6-10 years)">Senior (6-10 years)</option>
              <option value="Staff/Principal (10+ years)">Staff/Principal (10+ years)</option>
              <option value="Executive/Director">Executive/Director</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Job Preferences</label>
            <input value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} placeholder="Remote only, startup, etc." className={inputClass} readOnly={!editing} />
          </div>
        </div>

        {editing && (
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2 text-[#888] bg-white/[0.04] border border-white/10 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={() => { handleSave(); setEditing(false); }} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#028FA2] text-white text-sm font-medium rounded-lg hover:bg-[#027a8c] disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </div>
        )}
      </div>

      {/* Base Resume summary */}
      {resumes.length > 0 && (
        <div className="glass-card p-6 mt-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#028FA2]" />
              <h2 className="text-sm font-semibold text-white">Base Resumes</h2>
            </div>
            <Link to="/resume" className="text-xs font-medium text-[#028FA2] hover:underline">Manage →</Link>
          </div>
          <div className="space-y-2">
            {resumes.slice(0, 3).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 glass rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-[#028FA2] shrink-0" />
                  <span className="text-sm font-medium text-white truncate">{r.name || r.fullName || "Untitled"}</span>
                </div>
                <span className="text-[10px] text-[#555] shrink-0">{r.skills?.length || 0} skills · {r.experience?.length || 0} exp</span>
              </div>
            ))}
            {resumes.length > 3 && <p className="text-[10px] text-[#555] text-center">+{resumes.length - 3} more</p>}
          </div>
        </div>
      )}

      {/* Job Search Preferences */}
      <div className="glass-card p-6 mt-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06]">
          <Search className="h-4 w-4 text-[#028FA2]" />
          <h2 className="text-sm font-semibold text-white">Job Search Preferences</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Target Job Title</label>
            <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="e.g. Senior Software Engineer" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Preferred Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Remote, New York, NY" className={inputClass} readOnly={!editing} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Experience Level</label>
            <select value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className={`${inputClass} ${editing ? 'bg-white' : 'bg-gray-50'}`} disabled={!editing}>
              <option value="">Select...</option>
              <option value="Entry-level (0-2 years)">Entry-level (0-2 years)</option>
              <option value="Mid-level (3-5 years)">Mid-level (3-5 years)</option>
              <option value="Senior (6-10 years)">Senior (6-10 years)</option>
              <option value="Staff/Principal (10+ years)">Staff/Principal (10+ years)</option>
              <option value="Executive/Director">Executive/Director</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1">Preferences (work style, company type)</label>
            <input value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} placeholder="Remote, startup, enterprise, etc." className={inputClass} readOnly={!editing} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1">Key Skills</label>
            <input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="React, Node.js, Python, AWS..." className={inputClass} readOnly={!editing} />
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-[#028FA2]/10 border border-[#028FA2]/10 rounded-lg">
        <p className="text-xs text-[#888]">Your data is stored in a local SQLite database and persists across container restarts via Docker volume mount.</p>
      </div>

      {/* ─── Import from Resume Modal ─── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-white/[0.06] max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Import from Resume</h3>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-[#888] mb-4">Select a resume to populate your profile. This will fill in name, email, phone, location, skills, and links from the resume data.</p>

            {resumes.length > 0 ? (
              <>
                <select
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#028FA2] mb-4 bg-white"
                >
                  {resumes.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name || r.fullName || "Untitled Resume"}</option>
                  ))}
                </select>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                  <p className="text-xs text-amber-700">This will overwrite any empty profile fields with data from the selected resume. Existing values will be kept.</p>
                </div>
              </>
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg text-center mb-4">
                <p className="text-sm text-[#888]">No resumes found. <Link to="/resume" className="text-[#028FA2] hover:underline font-medium">Upload one first</Link>.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowImportModal(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-[#888] bg-white/[0.04] border border-white/10 rounded-xl hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleImportFromResume} disabled={!selectedResumeId || resumes.length === 0} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                <Check className="h-4 w-4" /> Import & Fill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
