import { useState, useEffect } from "react";
import { Mail, Sparkles, Copy, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import LetterPaper from "@/components/LetterPaper";
import { api } from "@/lib/api";

export default function CoverLetter() {
  const [resumes, setResumes] = useState<any[]>([]);
  const [savedLetters, setSavedLetters] = useState<any[]>([]);
  const [selectedResume, setSelectedResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [tone, setTone] = useState("professional");
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getResumes().then((d: any) => setResumes(d || [])).catch(() => {});
    api.getCoverLetters().then((d: any) => setSavedLetters(d || [])).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!selectedResume || !jobDescription.trim()) {
      toast.error("Select a resume and paste a job description");
      return;
    }
    const resume = resumes.find((r: any) => r.id === selectedResume);
    if (!resume) return;
    const resumeText = resume.rawText || `${resume.fullName}\n${resume.summary}\n${resume.skills?.join(", ")}`;

    setLoading(true);
    try {
      const res = await api.coverLetter(resumeText, jobDescription, tone);
      setCoverLetter(res.coverLetter);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(coverLetter);
    toast.success("Copied to clipboard!");
  };

  const handleSave = async () => {
    if (!coverLetter) return;
    try {
      const saved = await api.saveCoverLetter({
        content: coverLetter,
        resumeId: selectedResume,
        tone,
      });
      setSavedLetters((prev) => [...prev, saved]);
      toast.success("Cover letter saved!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCoverLetter(id);
      setSavedLetters((prev) => prev.filter((l) => l.id !== id));
      toast.success("Deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="animate-fade-in max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Cover Letter</h1>
      <p className="text-sm text-gray-500 mb-6">Generate a tailored cover letter using AI.</p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Resume</label>
            <select value={selectedResume} onChange={(e) => setSelectedResume(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Choose a resume...</option>
              {resumes.map((r: any) => (
                <option key={r.id} value={r.id}>{r.fullName || r.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tone</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="professional">Professional</option>
              <option value="enthusiastic">Enthusiastic</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={10} placeholder="Paste the job description here..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <button onClick={handleGenerate} disabled={loading || !selectedResume || !jobDescription.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating..." : "Generate Cover Letter"}
          </button>
        </div>

        {/* Output */}
        <div>
          {!coverLetter && !loading && (
            <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200 p-8">
              <div className="text-center">
                <Mail className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Your cover letter will appear here</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200 p-8">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-blue-500 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-500">Writing your cover letter...</p>
              </div>
            </div>
          )}

          {coverLetter && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <button onClick={handleSave} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                  <Download className="h-3 w-3" /> Save
                </button>
              </div>
              <LetterPaper text={coverLetter} />
            </div>
          )}

          {/* Saved letters */}
          {savedLetters.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Saved Letters</h3>
              <div className="space-y-2">
                {savedLetters.map((l) => (
                  <div key={l.id} className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setCoverLetter(l.content)}>
                    <div>
                      <p className="text-sm text-gray-700 truncate max-w-[200px]">{l.content?.slice(0, 60)}...</p>
                      <p className="text-xs text-gray-400">{l.tone} · {new Date(l.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(l.id); }} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
