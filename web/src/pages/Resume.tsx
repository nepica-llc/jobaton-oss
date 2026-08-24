import { useState, useEffect, useRef } from "react";
import { Upload, Plus, Trash2, FileText, Download, Sparkles, Loader2, Check, X, LayoutGrid, List, Linkedin } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ResumeData {
  id?: string;
  name: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  summary: string;
  experience: { title: string; company: string; location: string; startDate: string; endDate: string; bullets: string[] }[];
  education: { school: string; degree: string; field?: string; year: string; gpa?: string; honors?: string }[];
  skills: string[];
  certifications: { name: string; issuer: string; year: string }[];
  projects: { name: string; description: string; technologies: string }[];
  languages: { language: string; proficiency: string }[];
  volunteer: { role: string; organization: string; description: string }[];
  publications: string[];
  awards: string[];
  rawText?: string;
}

const emptyResume: ResumeData = {
  name: "My Resume",
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  github: "",
  portfolio: "",
  summary: "",
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  languages: [],
  volunteer: [],
  publications: [],
  awards: [],
};

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

function generateResumeName(parsed: ResumeData, existingCount: number): string {
  const parts = (parsed.fullName || "").trim().split(/\s+/);
  const firstName = parts[0] || "Resume";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  // Derive domain abbreviation from top skill or job title
  const domain = (parsed.skills?.[0] || parsed.experience?.[0]?.title || "General")
    .replace(/[^a-zA-Z\s]/g, "")
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
    .slice(0, 4);
  return `${existingCount + 1}_${firstName}${lastName ? "_" + lastName : ""}_${domain}`;
}

export default function Resume() {
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [active, setActive] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ step: string; percent: number } | null>(null);
  const [nameModal, setNameModal] = useState<{ resume: ResumeData; suggestedName: string } | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [viewMode, setViewMode] = useState<"tile" | "list">("tile");
  const [activeSection, setActiveSection] = useState<"info" | "summary" | "experience" | "education" | "skills" | "certifications" | "other">("info");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getResumes().then((data: any) => {
      const withNames = (data || []).map((r: any) => ({ ...r, name: r.name || r.fullName || "Untitled Resume" }));
      setResumes(withNames);
    }).catch(() => {});
  }, []);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push((content.items as any[]).map((item) => item.str).join(" "));
    }
    return pages.join("\n\n");
  };

  const parseWithAI = async (text: string): Promise<ResumeData> => {
    const res = await api.chat([
      {
        role: "system",
        content: `Parse this resume text into structured JSON. Extract EVERYTHING the person has listed. Output ONLY valid JSON with this shape:
{
  "fullName": "", "email": "", "phone": "", "location": "",
  "linkedin": "", "github": "", "portfolio": "",
  "summary": "",
  "experience": [{"title":"","company":"","location":"","startDate":"","endDate":"","bullets":[""]}],
  "education": [{"school":"","degree":"","field":"field of study","year":"graduation year","gpa":"if mentioned","honors":"cum laude, dean's list, etc."}],
  "skills": ["skill1","skill2"],
  "certifications": [{"name":"cert name","issuer":"issuing org","year":"year obtained"}],
  "projects": [{"name":"project name","description":"what it does","technologies":"tech used"}],
  "languages": [{"language":"English","proficiency":"Native"}],
  "volunteer": [{"role":"role","organization":"org","description":"what they did"}],
  "publications": ["publication title or citation"],
  "awards": ["award or honor"]
}
Rules:
- Extract ALL sections from the resume — do not skip certifications, projects, languages, volunteer work, publications, awards, or any other section
- If a field is not found, use empty string or empty array
- For skills, split into individual items (not comma-separated strings)
- For education, capture field of study, GPA, and honors separately
- Capture LinkedIn, GitHub, portfolio URLs if present`,
      },
      { role: "user", content: text },
    ]);
    const parsed = JSON.parse(res.content);
    return {
      ...emptyResume,
      ...parsed,
      rawText: text,
      name: "",
      certifications: parsed.certifications || [],
      projects: parsed.projects || [],
      languages: parsed.languages || [],
      volunteer: parsed.volunteer || [],
      publications: parsed.publications || [],
      awards: parsed.awards || [],
    };
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadProgress({ step: "Reading PDF...", percent: 15 });
    try {
      const text = await extractTextFromPdf(file);
      setUploadProgress({ step: "Analyzing with AI...", percent: 45 });
      const parsed = await parseWithAI(text);
      setUploadProgress({ step: "Done!", percent: 100 });
      // Show name modal instead of auto-saving
      const suggested = generateResumeName(parsed, resumes.length);
      setNameInput(suggested);
      setNameModal({ resume: parsed, suggestedName: suggested });
    } catch (err: any) {
      toast.error(err.message || "Failed to parse resume");
    } finally {
      setUploadProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSaveWithName = async () => {
    if (!nameModal) return;
    const resumeToSave = { ...nameModal.resume, name: nameInput.trim() || nameModal.suggestedName };
    setNameModal(null);
    setLoading(true);
    try {
      const saved = await api.saveResume(resumeToSave);
      setResumes((prev) => [...prev, saved]);
      setActive(null); // stay on list view
      toast.success(`Resume saved as "${saved.name}"`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setActive({ ...emptyResume });
  };

  const handleSave = async () => {
    if (!active) return;
    setLoading(true);
    try {
      if (active.id) {
        await api.updateResume(active.id, active);
        setResumes((prev) => prev.map((r) => (r.id === active.id ? active : r)));
      } else {
        const saved = await api.saveResume(active);
        setResumes((prev) => [...prev, saved]);
        setActive(saved);
      }
      toast.success("Resume saved!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
      if (active?.id === id) setActive(null);
      toast.success("Resume deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAIGenerate = async () => {
    if (!active?.rawText) {
      toast.error("Upload a resume first or enter your details");
      return;
    }
    setAiLoading(true);
    try {
      const res = await api.chat([
        {
          role: "system",
          content: "You are a professional resume writer. Improve the following resume summary to be more compelling and ATS-friendly. Output ONLY the improved summary text, nothing else.",
        },
        { role: "user", content: `Current summary: ${active.summary}\n\nFull resume context: ${active.rawText}` },
      ]);
      setActive({ ...active, summary: res.content });
      toast.success("Summary improved by AI!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const updateField = (field: keyof ResumeData, value: any) => {
    if (active) setActive({ ...active, [field]: value });
  };

  const updateExperience = (idx: number, field: string, value: any) => {
    if (!active) return;
    const exp = [...active.experience];
    exp[idx] = { ...exp[idx], [field]: value };
    setActive({ ...active, experience: exp });
  };

  const addExperience = () => {
    if (!active) return;
    setActive({
      ...active,
      experience: [...active.experience, { title: "", company: "", location: "", startDate: "", endDate: "", bullets: [""] }],
    });
  };

  const removeExperience = (idx: number) => {
    if (!active) return;
    setActive({ ...active, experience: active.experience.filter((_, i) => i !== idx) });
  };

  const getDomain = (r: any): string => {
    const name = r.name || "";
    const parts = name.split("_");
    if (parts.length >= 4) return parts.slice(3).join("_");
    if (r.experience?.[0]?.title) {
      const t = r.experience[0].title.toLowerCase();
      if (t.includes("security") || t.includes("iam") || t.includes("cyber")) return "Security";
      if (t.includes("data") || t.includes("analytics")) return "Data";
      if (t.includes("devops") || t.includes("sre") || t.includes("cloud")) return "DevOps";
      if (t.includes("frontend") || t.includes("ui") || t.includes("react")) return "Frontend";
      if (t.includes("backend") || t.includes("api")) return "Backend";
      if (t.includes("full")) return "Full Stack";
      if (t.includes("mobile") || t.includes("ios") || t.includes("android")) return "Mobile";
      if (t.includes("manager") || t.includes("lead")) return "Management";
      return "Engineering";
    }
    return "—";
  };

  // --- List view (no active resume) ---
  if (!active) {
    return (
      <div className="animate-fade-in max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Base Resumes</h1>
            <p className="text-sm text-[#666] mt-0.5">Master copies — each job gets a tailored version from these.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-white/[0.06] rounded-md p-0.5">
              <button onClick={() => setViewMode("tile")} className={`p-1 rounded transition-all ${viewMode === "tile" ? "bg-white/[0.06] text-white" : "text-[#555] hover:text-white"}`}><LayoutGrid className="h-3.5 w-3.5" /></button>
              <button onClick={() => setViewMode("list")} className={`p-1 rounded transition-all ${viewMode === "list" ? "bg-white/[0.06] text-white" : "text-[#555] hover:text-white"}`}><List className="h-3.5 w-3.5" /></button>
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={!!uploadProgress || loading} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50">
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Upload PDF
            </button>
            <button onClick={handleCreateNew} className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
              <Plus className="h-3 w-3" /> New
            </button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf" onChange={handleUpload} className="hidden" />

        {resumes.length === 0 ? (
          <div className="glass-card rounded-lg p-12 text-center">
            <FileText className="h-8 w-8 text-[#555] mx-auto mb-3" />
            <h3 className="text-sm font-medium text-white mb-1">No base resumes yet</h3>
            <p className="text-xs text-[#555] mb-4 max-w-sm mx-auto">Upload your master resume as PDF or create one from scratch.</p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
                <Upload className="h-3 w-3" /> Upload PDF
              </button>
              <button onClick={handleCreateNew} className="glass-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md">
                <Plus className="h-3 w-3" /> Create
              </button>
            </div>
          </div>
        ) : viewMode === "tile" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resumes.map((r) => (
              <div key={r.id} className="glass-card rounded-lg p-5 hover:shadow-lg transition-all cursor-pointer group" onClick={() => setActive(r)}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#028FA2]/10">
                    <FileText className="h-5 w-5 text-[#028FA2]" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id!); }} className="p-1.5 text-[#555] hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#028FA2] transition-colors">{r.name || "Untitled Resume"}</h3>
                <p className="text-xs text-[#555] mt-1">{r.fullName || "No name"}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 bg-[#028FA2]/10 text-[#028FA2] text-[10px] rounded-full font-medium">{getDomain(r)}</span>
                </div>
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/40 text-[10px] text-[#555]">
                  <span>{r.experience?.length || 0} positions</span>
                  <span>·</span>
                  <span>{r.skills?.length || 0} skills</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Resume</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Full Name</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Domain</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Experience</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider">Skills</th>
                    <th className="px-4 py-3 text-[10px] font-semibold text-[#555] uppercase tracking-wider w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100/50">
                  {resumes.map((r) => (
                    <tr key={r.id} className="hover:bg-white/60 cursor-pointer transition-colors group" onClick={() => setActive(r)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[#028FA2]" />
                          <span className="text-sm font-semibold text-white truncate max-w-[200px] group-hover:text-[#028FA2] transition-colors">{r.name || "Untitled"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#888] font-medium">{r.fullName || "—"}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-[#028FA2]/10 text-[#028FA2] text-[10px] rounded-full font-medium">{getDomain(r)}</span></td>
                      <td className="px-4 py-3 text-xs text-[#555]">{r.experience?.length || 0} positions</td>
                      <td className="px-4 py-3 text-xs text-[#555]">{r.skills?.length || 0}</td>
                      <td className="px-4 py-3">
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id!); }} className="p-1 text-[#555] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-white/[0.04] text-[10px] text-[#555]">
              {resumes.length} base resume{resumes.length !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* ─── Upload Progress Overlay ─── */}
        {uploadProgress && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-white/[0.06] max-w-md w-full mx-4 p-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
                <div className="absolute inset-0 rounded-full border-4 border-[#028FA2] border-t-transparent animate-spin" />
                <FileText className="absolute inset-0 m-auto h-6 w-6 text-[#028FA2]" />
              </div>
              <h3 className="text-lg font-semibold text-white">{uploadProgress.step}</h3>
              <div className="w-full bg-white/[0.06] rounded-full h-2 mt-4">
                <div
                  className="bg-[#028FA2] h-2 rounded-full transition-all duration-500"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
              <p className="text-xs text-[#555] mt-2">{uploadProgress.percent}% — Please wait, do not navigate away</p>
              <p className="text-xs text-[#888] italic mt-4 px-4 leading-relaxed">"{getRandomQuote()}"</p>
            </div>
          </div>
        )}

        {/* ─── Name Resume Modal ─── */}
        {nameModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-white/[0.06] max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Name Your Resume</h3>
                <button onClick={() => setNameModal(null)} className="p-1 text-[#555] hover:text-[#888]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-[#888] mb-4">Give this resume a recognizable name. We suggest a format like <span className="font-mono text-xs bg-white/[0.06] px-1.5 py-0.5 rounded">#_FName_LName_Domain</span></p>
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveWithName()}
                autoFocus
                className="w-full px-4 py-3 border border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#028FA2] focus:border-transparent"
                placeholder="e.g. 1_John_Doe_IAM"
              />
              <p className="text-[10px] text-[#555] mt-1.5">Suggested: <button onClick={() => setNameInput(nameModal.suggestedName)} className="text-[#028FA2] hover:underline font-medium">{nameModal.suggestedName}</button></p>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setNameModal(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-[#888] bg-white/[0.04] border border-white/10 rounded-xl hover:bg-white/[0.04] transition-colors">
                  Cancel
                </button>
                <button onClick={handleSaveWithName} disabled={!nameInput.trim()} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#028FA2] rounded-xl hover:bg-[#027a8c] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5">
                  <Check className="h-4 w-4" /> Save Resume
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Editor view (split: left=form, right=preview) ---
  const SECTIONS = ["info", "summary", "experience", "education", "skills", "certifications", "other"] as const;

  const sectionLabels: Record<typeof SECTIONS[number], string> = { info: "Personal Info", summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", certifications: "Certifications", other: "Other" };

  return (
    <div className="animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex-1 min-w-0">
          <button onClick={() => setActive(null)} className="text-sm text-[#028FA2] hover:underline mb-1">&larr; Back to list</button>
          <input
            value={active.name || ""}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="Click to name this resume..."
            className="block text-xl font-bold text-white w-full border border-transparent rounded-lg px-2 py-0.5 hover:border-white/10 focus:border-[#028FA2] focus:ring-2 focus:ring-[#028FA2]/20 outline-none transition-all bg-transparent placeholder:text-[#555]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleAIGenerate} disabled={aiLoading} className="glass-btn flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50">
            {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Improve
          </button>
          <button onClick={handleSave} disabled={loading} className="glass-btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </button>
        </div>
      </div>

      {/* AI Loading overlay */}
      {aiLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] rounded-lg shadow-2xl border border-white/[0.06] max-w-md w-full mx-4 p-8 text-center">
            <Loader2 className="h-10 w-10 text-[#028FA2] animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">AI is working...</h3>
            <p className="text-xs text-[#555] mt-2">Please wait, do not navigate away</p>
            <p className="text-xs text-[#888] italic mt-4 px-4 leading-relaxed">"{getRandomQuote()}"</p>
          </div>
        </div>
      )}

      {/* Split layout */}
      <div className="flex gap-5 items-start">
        {/* LEFT: Section navigation + form */}
        <div className="flex-1 min-w-0">
          {/* Section tabs */}
          <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
            {SECTIONS.map((sec) => (
              <button key={sec} onClick={() => setActiveSection(sec)} className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeSection === sec ? "glass-btn-primary" : "text-[#888] hover:text-white hover:bg-white/[0.04]"}`}>
                {sectionLabels[sec]}
              </button>
            ))}
          </div>

          {/* Section form */}
          <div className="glass-card rounded-lg p-5">
            {activeSection === "info" && (
              <div className="grid grid-cols-2 gap-4">
                <Input label="Full Name" value={active.fullName} onChange={(v) => updateField("fullName", v)} />
                <Input label="Email" value={active.email} onChange={(v) => updateField("email", v)} />
                <Input label="Phone" value={active.phone} onChange={(v) => updateField("phone", v)} />
                <Input label="Location" value={active.location} onChange={(v) => updateField("location", v)} />
                <Input label="LinkedIn" value={active.linkedin || ""} onChange={(v) => updateField("linkedin", v)} placeholder="https://linkedin.com/in/..." />
                <Input label="GitHub" value={active.github || ""} onChange={(v) => updateField("github", v)} placeholder="https://github.com/..." />
                <Input label="Portfolio" value={active.portfolio || ""} onChange={(v) => updateField("portfolio", v)} placeholder="https://yoursite.com" />
              </div>
            )}

            {activeSection === "summary" && (
              <textarea value={active.summary} onChange={(e) => updateField("summary", e.target.value)} rows={14} className="glass-input w-full h-full min-h-[300px] px-4 py-3 rounded-lg text-sm resize-y" placeholder="Professional summary..." />
            )}

            {activeSection === "experience" && (
              <div className="space-y-3">
                {active.experience.map((exp, idx) => (
                  <div key={idx} className="border border-white/[0.06] rounded-lg p-4 relative">
                    <button onClick={() => removeExperience(idx)} className="absolute top-3 right-3 p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <Input label="Job Title" value={exp.title} onChange={(v) => updateExperience(idx, "title", v)} />
                      <Input label="Company" value={exp.company} onChange={(v) => updateExperience(idx, "company", v)} />
                      <Input label="Start" value={exp.startDate} onChange={(v) => updateExperience(idx, "startDate", v)} />
                      <Input label="End" value={exp.endDate} onChange={(v) => updateExperience(idx, "endDate", v)} placeholder="Present" />
                    </div>
                    <label className="block text-xs font-medium text-[#888] mb-1">Bullets</label>
                    {exp.bullets.map((b, bi) => (
                      <div key={bi} className="flex gap-2 mb-1.5">
                        <span className="text-[#555] text-sm mt-1.5">•</span>
                        <input value={b} onChange={(e) => { const bullets = [...exp.bullets]; bullets[bi] = e.target.value; updateExperience(idx, "bullets", bullets); }} className="glass-input flex-1 px-2 py-1.5 rounded text-sm" />
                        <button onClick={() => updateExperience(idx, "bullets", exp.bullets.filter((_, i) => i !== bi))} className="p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => updateExperience(idx, "bullets", [...exp.bullets, ""])} className="text-xs text-[#028FA2] hover:underline mt-1">+ Add bullet</button>
                  </div>
                ))}
                <button onClick={addExperience} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add Position</button>
              </div>
            )}

            {activeSection === "education" && (
              <div className="space-y-3">
                {(active.education || []).map((edu, idx) => (
                  <div key={idx} className="border border-white/[0.06] rounded-lg p-4 relative">
                    <button onClick={() => updateField("education", active.education.filter((_, i) => i !== idx))} className="absolute top-3 right-3 p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="School" value={edu.school} onChange={(v) => { const ed = [...active.education]; ed[idx] = { ...ed[idx], school: v }; updateField("education", ed); }} />
                      <Input label="Degree" value={edu.degree} onChange={(v) => { const ed = [...active.education]; ed[idx] = { ...ed[idx], degree: v }; updateField("education", ed); }} />
                      <Input label="Field" value={edu.field || ""} onChange={(v) => { const ed = [...active.education]; ed[idx] = { ...ed[idx], field: v }; updateField("education", ed); }} />
                      <Input label="Year" value={edu.year} onChange={(v) => { const ed = [...active.education]; ed[idx] = { ...ed[idx], year: v }; updateField("education", ed); }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => updateField("education", [...(active.education || []), { school: "", degree: "", field: "", year: "", gpa: "", honors: "" }])} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add Education</button>
              </div>
            )}

            {activeSection === "skills" && (
              <div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {active.skills.map((s, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 border border-white/[0.06] rounded-md bg-white/[0.02] group">
                      <span className="text-xs text-white truncate">{s}</span>
                      <button onClick={() => setActive({ ...active, skills: active.skills.filter((_, si) => si !== i) })} className="text-[#555] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1">×</button>
                    </div>
                  ))}
                </div>
                <input placeholder="Type a skill and press Enter" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) { setActive({ ...active, skills: [...active.skills, (e.target as HTMLInputElement).value.trim()] }); (e.target as HTMLInputElement).value = ""; } }} className="glass-input w-full px-3 py-2 rounded-lg text-sm" />
                <p className="text-[10px] text-[#555] mt-1">{active.skills.length} skills</p>
              </div>
            )}

            {activeSection === "certifications" && (
              <div className="space-y-3">
                {(active.certifications || []).map((cert, idx) => (
                  <div key={idx} className="border border-white/[0.06] rounded-lg p-4 relative">
                    <button onClick={() => updateField("certifications", (active.certifications || []).filter((_, i) => i !== idx))} className="absolute top-3 right-3 p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    <div className="grid grid-cols-3 gap-3">
                      <Input label="Name" value={cert.name} onChange={(v) => { const c = [...(active.certifications || [])]; c[idx] = { ...c[idx], name: v }; updateField("certifications", c); }} />
                      <Input label="Issuer" value={cert.issuer} onChange={(v) => { const c = [...(active.certifications || [])]; c[idx] = { ...c[idx], issuer: v }; updateField("certifications", c); }} />
                      <Input label="Year" value={cert.year} onChange={(v) => { const c = [...(active.certifications || [])]; c[idx] = { ...c[idx], year: v }; updateField("certifications", c); }} />
                    </div>
                  </div>
                ))}
                <button onClick={() => updateField("certifications", [...(active.certifications || []), { name: "", issuer: "", year: "" }])} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add Certification</button>
              </div>
            )}

            {activeSection === "other" && (
              <div className="space-y-6">
                {/* Projects */}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Projects</h4>
                  <div className="space-y-3">
                    {(active.projects || []).map((proj, idx) => (
                      <div key={idx} className="border border-white/[0.06] rounded-lg p-4 relative">
                        <button onClick={() => updateField("projects", (active.projects || []).filter((_, i) => i !== idx))} className="absolute top-3 right-3 p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <Input label="Name" value={proj.name} onChange={(v) => { const p = [...(active.projects || [])]; p[idx] = { ...p[idx], name: v }; updateField("projects", p); }} />
                          <Input label="Technologies" value={proj.technologies} onChange={(v) => { const p = [...(active.projects || [])]; p[idx] = { ...p[idx], technologies: v }; updateField("projects", p); }} />
                        </div>
                        <textarea value={proj.description} onChange={(e) => { const p = [...(active.projects || [])]; p[idx] = { ...p[idx], description: e.target.value }; updateField("projects", p); }} rows={2} className="glass-input w-full px-3 py-2 rounded-lg text-sm resize-none" placeholder="Description..." />
                      </div>
                    ))}
                    <button onClick={() => updateField("projects", [...(active.projects || []), { name: "", description: "", technologies: "" }])} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add Project</button>
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Languages</h4>
                  <div className="space-y-2">
                    {(active.languages || []).map((lang, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <input value={lang.language} onChange={(e) => { const l = [...(active.languages || [])]; l[idx] = { ...l[idx], language: e.target.value }; updateField("languages", l); }} placeholder="Language" className="glass-input flex-1 px-3 py-2 rounded-lg text-sm" />
                        <select value={lang.proficiency} onChange={(e) => { const l = [...(active.languages || [])]; l[idx] = { ...l[idx], proficiency: e.target.value }; updateField("languages", l); }} className="glass-input px-3 py-2 rounded-lg text-sm">
                          <option value="">Level...</option><option value="Native">Native</option><option value="Fluent">Fluent</option><option value="Advanced">Advanced</option><option value="Intermediate">Intermediate</option><option value="Basic">Basic</option>
                        </select>
                        <button onClick={() => updateField("languages", (active.languages || []).filter((_, i) => i !== idx))} className="p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    <button onClick={() => updateField("languages", [...(active.languages || []), { language: "", proficiency: "" }])} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add Language</button>
                  </div>
                </div>

                {/* Volunteer */}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Volunteer</h4>
                  <div className="space-y-3">
                    {(active.volunteer || []).map((vol, idx) => (
                      <div key={idx} className="border border-white/[0.06] rounded-lg p-4 relative">
                        <button onClick={() => updateField("volunteer", (active.volunteer || []).filter((_, i) => i !== idx))} className="absolute top-3 right-3 p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <Input label="Role" value={vol.role} onChange={(v) => { const vl = [...(active.volunteer || [])]; vl[idx] = { ...vl[idx], role: v }; updateField("volunteer", vl); }} />
                          <Input label="Organization" value={vol.organization} onChange={(v) => { const vl = [...(active.volunteer || [])]; vl[idx] = { ...vl[idx], organization: v }; updateField("volunteer", vl); }} />
                        </div>
                        <textarea value={vol.description} onChange={(e) => { const vl = [...(active.volunteer || [])]; vl[idx] = { ...vl[idx], description: e.target.value }; updateField("volunteer", vl); }} rows={2} className="glass-input w-full px-3 py-2 rounded-lg text-sm resize-none" />
                      </div>
                    ))}
                    <button onClick={() => updateField("volunteer", [...(active.volunteer || []), { role: "", organization: "", description: "" }])} className="w-full py-2 border border-dashed border-[#028FA2]/30 text-xs font-medium text-[#028FA2] rounded-lg hover:bg-[#028FA2]/10 transition-colors">+ Add</button>
                  </div>
                </div>

                {/* Publications */}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Publications</h4>
                  <div className="space-y-2">
                    {(active.publications || []).map((pub, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[#555] text-sm mt-1.5">•</span>
                        <input value={pub} onChange={(e) => { const p = [...(active.publications || [])]; p[i] = e.target.value; updateField("publications", p); }} className="glass-input flex-1 px-2 py-1.5 rounded text-sm" />
                        <button onClick={() => updateField("publications", (active.publications || []).filter((_, pi) => pi !== i))} className="p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => updateField("publications", [...(active.publications || []), ""])} className="text-xs text-[#028FA2] hover:underline">+ Add publication</button>
                  </div>
                </div>

                {/* Awards */}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Awards</h4>
                  <div className="space-y-2">
                    {(active.awards || []).map((award, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[#555] text-sm mt-1.5">•</span>
                        <input value={award} onChange={(e) => { const a = [...(active.awards || [])]; a[i] = e.target.value; updateField("awards", a); }} className="glass-input flex-1 px-2 py-1.5 rounded text-sm" />
                        <button onClick={() => updateField("awards", (active.awards || []).filter((_, ai) => ai !== i))} className="p-1 text-[#555] hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => updateField("awards", [...(active.awards || []), ""])} className="text-xs text-[#028FA2] hover:underline">+ Add award</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Live resume preview (resume-shaped, scaled to fit) */}
        <div className="hidden lg:block w-[340px] shrink-0 sticky top-4">
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-sm p-4 aspect-[8.5/11] overflow-hidden text-[8px] leading-tight" style={{ transform: 'scale(1)', transformOrigin: 'top center' }}>
            {/* Header */}
            <div className={`border-b border-white/[0.08] pb-2 mb-2 transition-all ${activeSection === "info" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -m-1.5" : ""}`} onClick={() => setActiveSection("info")}>
              <p className="text-sm font-bold text-white">{active.fullName || "Your Name"}</p>
              <p className="text-[9px] text-[#888]">{[active.email, active.phone, active.location].filter(Boolean).join(" · ")}</p>
              {(active.linkedin || active.github) && <p className="text-[8px] text-[#555] truncate">{[active.linkedin, active.github, active.portfolio].filter(Boolean).join(" | ")}</p>}
            </div>

            {/* Summary */}
            {active.summary && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "summary" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("summary")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Summary</p>
                <p className="text-[#888] line-clamp-3">{active.summary}</p>
              </div>
            )}

            {/* Experience */}
            {active.experience.length > 0 && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "experience" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("experience")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Experience</p>
                {active.experience.slice(0, 3).map((exp, i) => (
                  <div key={i} className="mb-1">
                    <p className="font-semibold text-white">{exp.title || "Title"} <span className="font-normal text-[#555]">· {exp.company}</span></p>
                    <p className="text-[8px] text-[#555]">{exp.startDate} – {exp.endDate || "Present"}</p>
                    {exp.bullets.slice(0, 2).map((b, bi) => b && <p key={bi} className="text-[#888] pl-2">• {b.slice(0, 60)}{b.length > 60 ? "…" : ""}</p>)}
                  </div>
                ))}
                {active.experience.length > 3 && <p className="text-[#555]">+{active.experience.length - 3} more</p>}
              </div>
            )}

            {/* Education */}
            {(active.education || []).length > 0 && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "education" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("education")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Education</p>
                {(active.education || []).map((edu, i) => (
                  <p key={i} className="text-white"><span className="font-semibold">{edu.degree}</span> {edu.field && `in ${edu.field}`} — {edu.school} {edu.year && `(${edu.year})`}</p>
                ))}
              </div>
            )}

            {/* Skills */}
            {active.skills.length > 0 && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "skills" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("skills")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Skills</p>
                <p className="text-[#888]">{active.skills.join(" · ")}</p>
              </div>
            )}

            {/* Certifications */}
            {(active.certifications || []).length > 0 && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "certifications" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("certifications")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Certifications</p>
                {(active.certifications || []).map((c, i) => <p key={i} className="text-[#888]">{c.name} — {c.issuer} ({c.year})</p>)}
              </div>
            )}

            {/* Projects */}
            {(active.projects || []).length > 0 && (
              <div className={`mb-2 transition-all cursor-pointer ${activeSection === "other" ? "ring-2 ring-[#028FA2]/30 rounded-lg p-1.5 -mx-1.5" : ""}`} onClick={() => setActiveSection("other")}>
                <p className="font-bold uppercase text-[8px] text-[#555] mb-0.5">Projects</p>
                {(active.projects || []).map((p, i) => <p key={i} className="text-white"><span className="font-semibold">{p.name}</span> <span className="text-[#555]">{p.technologies && `(${p.technologies})`}</span></p>)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#888] mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full px-3 py-2 rounded-lg text-sm"
      />
    </div>
  );
}
