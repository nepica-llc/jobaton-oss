const BASE = "/api";

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json.data ?? json;
}

export const api = {
  // Settings
  getSettings: () => request("/settings"),
  saveSettings: (data: Record<string, string>) =>
    request("/settings", { method: "POST", body: JSON.stringify(data) }),

  // Resumes
  getResumes: () => request("/resumes"),
  saveResume: (data: any) =>
    request("/resumes", { method: "POST", body: JSON.stringify(data) }),
  updateResume: (id: string, data: any) =>
    request(`/resumes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteResume: (id: string) =>
    request(`/resumes/${id}`, { method: "DELETE" }),

  // Cover Letters
  getCoverLetters: () => request("/cover-letters"),
  saveCoverLetter: (data: any) =>
    request("/cover-letters", { method: "POST", body: JSON.stringify(data) }),
  deleteCoverLetter: (id: string) =>
    request(`/cover-letters/${id}`, { method: "DELETE" }),

  // Profile
  getProfile: () => request("/profile"),
  saveProfile: (data: any) =>
    request("/profile", { method: "PUT", body: JSON.stringify(data) }),

  // Jobs
  getJobs: (status?: string) => request(`/jobs${status ? `?status=${status}` : ""}`),
  getJob: (id: string) => request(`/jobs/${id}`),
  createJob: (data: any) =>
    request("/jobs", { method: "POST", body: JSON.stringify(data) }),
  updateJob: (id: string, data: any) =>
    request(`/jobs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteJob: (id: string) =>
    request(`/jobs/${id}`, { method: "DELETE" }),

  // AI
  searchJobs: (profile: { title?: string; skills?: string; location?: string; experience?: string; preferences?: string }) =>
    request("/ai/search-jobs", { method: "POST", body: JSON.stringify(profile) }),
  parseJob: (rawDescription: string) =>
    request("/ai/parse-job", { method: "POST", body: JSON.stringify({ rawDescription }) }),
  tailorResume: (resumeText: string, jobDescription: string) =>
    request("/ai/tailor-resume", { method: "POST", body: JSON.stringify({ resumeText, jobDescription }) }),
  atsScore: (resumeText: string, jobDescription: string) =>
    request("/ai/ats-score", { method: "POST", body: JSON.stringify({ resumeText, jobDescription }) }),
  coverLetter: (resumeText: string, jobDescription: string, tone?: string) =>
    request("/ai/cover-letter", { method: "POST", body: JSON.stringify({ resumeText, jobDescription, tone }) }),
  studyGuide: (jobTitle: string, company: string, jobDescription: string) =>
    request("/ai/study-guide", { method: "POST", body: JSON.stringify({ jobTitle, company, jobDescription }) }),
  studyContent: (mode: string, topic: string, moduleTitle: string, jobTitle: string, jobDescription: string) =>
    request("/ai/study-content", { method: "POST", body: JSON.stringify({ mode, topic, moduleTitle, jobTitle, jobDescription }) }),
  generateLesson: (skill: string, jobTitle: string, company: string, lessonTitle: string, lessonType: string, allLessonTitles: string[]) =>
    request("/ai/generate-lesson", { method: "POST", body: JSON.stringify({ skill, jobTitle, company, lessonTitle, lessonType, allLessonTitles }) }),
  interviewPrep: (jobTitle: string, company: string, jobDescription: string) =>
    request("/ai/interview-prep", { method: "POST", body: JSON.stringify({ jobTitle, company, jobDescription }) }),
  mockInterview: (jobTitle: string, jobDescription: string, resumeText: string, messages: any[]) =>
    request("/ai/mock-interview", { method: "POST", body: JSON.stringify({ jobTitle, jobDescription, resumeText, messages }) }),
  chat: (messages: any[], model?: string) =>
    request("/ai/chat", { method: "POST", body: JSON.stringify({ messages, model }) }),

  // JobSpy — real job scraping
  jobspySearch: async (searchTerm: string, location?: string, resultsWanted?: number, forceRefresh?: boolean) => {
    const params = new URLSearchParams({ search_term: searchTerm });
    if (location) params.set("location", location);
    if (resultsWanted) params.set("results_wanted", String(resultsWanted));
    if (forceRefresh) params.set("force_refresh", "true");
    const res = await fetch(`${BASE}/jobspy/search?${params.toString()}`);
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "JobSpy search failed");
    return json;
  },
  jobspyClearCache: () =>
    fetch(`${BASE}/jobspy/cache`, { method: "DELETE" }).then(r => r.json()),
};
