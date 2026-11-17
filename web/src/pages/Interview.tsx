import { useState, useEffect, useRef } from "react";
import { MessageSquare, Sparkles, Loader2, Send, RotateCcw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Tab = "prep" | "mock";

export default function Interview() {
  const [tab, setTab] = useState<Tab>("prep");
  const [resumes, setResumes] = useState<any[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [prepData, setPrepData] = useState<any>(null);

  // Mock interview state
  const [selectedResume, setSelectedResume] = useState("");
  const [mockStarted, setMockStarted] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getResumes().then((d: any) => setResumes(d || [])).catch(() => {});
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handlePrepGenerate = async () => {
    if (!jobTitle.trim() || !jobDescription.trim()) {
      toast.error("Enter a job title and description");
      return;
    }
    setLoading(true);
    try {
      const data = await api.interviewPrep(jobTitle, company, jobDescription, "technical");
      setPrepData(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startMock = async () => {
    if (!jobTitle.trim()) {
      toast.error("Enter a job title first");
      return;
    }
    const resume = resumes.find((r: any) => r.id === selectedResume);
    const resumeText = resume?.rawText || resume?.summary || "";
    setMockStarted(true);
    setSending(true);
    try {
      const res = await api.mockInterview(jobTitle, jobDescription, resumeText, []);
      setMessages([{ role: "assistant", content: res.content }]);
    } catch (err: any) {
      toast.error(err.message);
      setMockStarted(false);
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg = { role: "user" as const, content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setSending(true);
    try {
      const resume = resumes.find((r: any) => r.id === selectedResume);
      const resumeText = resume?.rawText || "";
      const res = await api.mockInterview(jobTitle, jobDescription, resumeText, updated);
      setMessages([...updated, { role: "assistant", content: res.content }]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  const resetMock = () => {
    setMockStarted(false);
    setMessages([]);
    setInput("");
  };

  return (
    <div className="animate-fade-in max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Interview</h1>
      <p className="text-sm text-gray-500 mb-4">Prepare for interviews with AI-generated prep and mock sessions.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab("prep")} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "prep" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <BookOpen className="h-4 w-4" /> Prep Guide
        </button>
        <button onClick={() => setTab("mock")} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === "mock" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          <MessageSquare className="h-4 w-4" /> Mock Interview
        </button>
      </div>

      {/* Shared inputs */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Senior Software Engineer" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company (optional)</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Google" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Prep Tab */}
      {tab === "prep" && (
        <div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
            <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={6} placeholder="Paste the full job description..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          <button onClick={handlePrepGenerate} disabled={loading} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating..." : "Generate Prep Guide"}
          </button>

          {prepData && (
            <div className="mt-6 space-y-4">
              {prepData.overview && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">Overview</h3>
                  <p className="text-sm text-blue-800">{prepData.overview}</p>
                </div>
              )}

              {prepData.rounds?.map((round: any, i: number) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-900">{round.name}</h3>
                    <span className="text-xs text-gray-400">{round.duration}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{round.description}</p>
                  {round.questions?.map((q: any, qi: number) => (
                    <div key={qi} className="mb-3 pl-3 border-l-2 border-blue-200">
                      <p className="text-sm font-medium text-gray-800">{q.question}</p>
                      {q.tip && <p className="text-xs text-gray-500 mt-1">Tip: {q.tip}</p>}
                    </div>
                  ))}
                </div>
              ))}

              {prepData.behavioralQuestions?.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Behavioral Questions</h3>
                  {prepData.behavioralQuestions.map((q: any, i: number) => (
                    <div key={i} className="mb-3 pl-3 border-l-2 border-purple-200">
                      <p className="text-sm font-medium text-gray-800">{q.question}</p>
                      {q.framework && <p className="text-xs text-gray-500 mt-1">{q.framework}</p>}
                    </div>
                  ))}
                </div>
              )}

              {prepData.tips?.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-green-900 mb-2">Tips</h3>
                  <ul className="space-y-1">
                    {prepData.tips.map((t: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                        <span className="text-green-500 mt-0.5">✓</span> {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mock Tab */}
      {tab === "mock" && (
        <div>
          {!mockStarted ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Select Resume (optional)</label>
                <select value={selectedResume} onChange={(e) => setSelectedResume(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">No resume</option>
                  {resumes.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.fullName || r.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} rows={4} placeholder="Paste JD for context..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <button onClick={startMock} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
                <MessageSquare className="h-4 w-4" /> Start Mock Interview
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col" style={{ height: "500px" }}>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-xl px-4 py-2.5">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-200 p-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type your answer..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={sendMessage} disabled={!input.trim() || sending} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <Send className="h-4 w-4" />
                </button>
                <button onClick={resetMock} className="px-3 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
