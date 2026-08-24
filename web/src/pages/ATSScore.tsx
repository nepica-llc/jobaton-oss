import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScanSearch, Loader2, CheckCircle, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export default function ATSScore() {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResume, setSelectedResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [creatingJob, setCreatingJob] = useState(false);

  useEffect(() => {
    api.getResumes().then((data: any) => setResumes(data || [])).catch(() => {});
  }, []);

  const handleScan = async () => {
    if (!selectedResume || !jobDescription.trim()) {
      toast.error("Select a resume and paste a job description");
      return;
    }
    const resume = resumes.find((r: any) => r.id === selectedResume);
    if (!resume) return;

    const resumeText = resume.rawText || `${resume.fullName}\n${resume.summary}\n${resume.experience?.map((e: any) => `${e.title} at ${e.company}\n${e.bullets?.join("\n")}`).join("\n")}\nSkills: ${resume.skills?.join(", ")}`;

    setLoading(true);
    setResult(null);
    try {
      const data = await api.atsScore(resumeText, jobDescription);
      setResult(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const ScoreIcon = ({ score }: { score: number }) => {
    if (score >= 80) return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (score >= 60) return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="animate-fade-in max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ATS Score</h1>
      <p className="text-sm text-gray-500 mb-6">Scan your resume against a job description to see how well it matches.</p>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Resume</label>
            <select
              value={selectedResume}
              onChange={(e) => setSelectedResume(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Choose a resume...</option>
              {resumes.map((r: any) => (
                <option key={r.id} value={r.id}>{r.name || r.fullName || "Untitled"}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={12}
              placeholder="Paste the full job description here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <button
            onClick={handleScan}
            disabled={loading || !selectedResume || !jobDescription.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {loading ? "Scanning..." : "Scan Resume"}
          </button>
        </div>

        {/* Results */}
        <div>
          {!result && !loading && (
            <div className="flex items-center justify-center h-full bg-white rounded-xl border border-gray-200 p-8">
              <div className="text-center">
                <ScanSearch className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Results will appear here after scanning</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-full bg-white rounded-xl border border-gray-200 p-8">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-blue-500 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-gray-500">Analyzing your resume...</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              {/* Overall Score */}
              <div className="text-center pb-4 border-b border-gray-100">
                <div className={`text-5xl font-bold ${scoreColor(result.score)}`}>{result.score}</div>
                <p className="text-sm text-gray-500 mt-1">ATS Match Score</p>
              </div>

              {/* Summary */}
              <p className="text-sm text-gray-700">{result.summary}</p>

              {/* Keyword Matches */}
              {result.keywordMatches?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Matched Keywords</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.keywordMatches.map((kw: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Keywords */}
              {result.missingKeywords?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Missing Keywords</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missingKeywords.map((kw: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full">{kw}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Scores */}
              {result.sections && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Section Breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(result.sections).map(([key, val]: [string, any]) => (
                      <div key={key} className="flex items-start gap-2">
                        <ScoreIcon score={val.score} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700 capitalize">{key}</span>
                            <span className={`text-sm font-bold ${scoreColor(val.score)}`}>{val.score}/100</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{val.feedback}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Suggestions</h3>
                  <ul className="space-y-1.5">
                    {result.suggestions.map((s: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-blue-500 mt-0.5">→</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Create Job Tile */}
              <div className="pt-3 border-t border-gray-100">
                <button
                  onClick={async () => {
                    setCreatingJob(true);
                    try {
                      const parsed = await api.parseJob(jobDescription);
                      const job = await api.createJob({
                        title: parsed.title || "Untitled Role",
                        company: parsed.company || "Unknown",
                        location: parsed.location || "",
                        salary: parsed.salary || "",
                        requirements: parsed.requirements || [],
                        nice_to_have: parsed.nice_to_have || [],
                        description_summary: parsed.description_summary || "",
                        raw_description: jobDescription,
                        status: "saved",
                        prep_data: { ats: result, resume_id: selectedResume },
                      });
                      toast.success(`Job created: ${job.title}`);
                      navigate(`/jobs/${job.id}`);
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setCreatingJob(false);
                    }
                  }}
                  disabled={creatingJob}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {creatingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {creatingJob ? "Creating..." : "Add to Jobs & Open Prep Zone"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
