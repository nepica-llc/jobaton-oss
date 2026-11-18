const BASE = "/api";
const PROFILE_KEY = "jobaton_profile";

export function getActiveProfile(): string {
  try { return localStorage.getItem(PROFILE_KEY) || "default"; } catch { return "default"; }
}

// Switching profile reloads the app so every page refetches its data for the new profile.
export function switchProfile(id: string): void {
  try { localStorage.setItem(PROFILE_KEY, id); } catch { /* private mode: stays on default */ }
  window.location.reload();
}

export type LessonQueue = { pending: string[]; failed: { key: string; error: string }[] };

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Profile-Id": getActiveProfile(), ...opts.headers },
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.error || `Request failed: ${res.status}`);
  return json.data ?? json;
}

export const api = {
  // Profiles
  getProfiles: () => request<{ id: string; name: string }[]>("/profiles"),
  createProfile: (name: string) =>
    request<{ id: string; name: string }>("/profiles", { method: "POST", body: JSON.stringify({ name }) }),
  renameProfile: (id: string, name: string) =>
    request(`/profiles/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  resetProfile: (id: string) =>
    request(`/profiles/${id}/reset`, { method: "POST" }),
  deleteProfile: (id: string) =>
    request(`/profiles/${id}`, { method: "DELETE" }),

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
  companyFacts: (company: string, jobTitle: string, jobDescription: string) =>
    request<{ facts: string[] }>("/ai/company-facts", { method: "POST", body: JSON.stringify({ company, jobTitle, jobDescription }) }),
  studyGuide: (jobTitle: string, company: string, jobDescription: string) =>
    request("/ai/study-guide", { method: "POST", body: JSON.stringify({ jobTitle, company, jobDescription }) }),
  studyContent: (mode: string, topic: string, moduleTitle: string, jobTitle: string, jobDescription: string) =>
    request("/ai/study-content", { method: "POST", body: JSON.stringify({ mode, topic, moduleTitle, jobTitle, jobDescription }) }),
  // Lessons are generated on the server and saved into the job, so they finish even if the page is closed.
  queueLessons: (jobId: string, items: { mod: number; lesson: number; fresh?: boolean }[]) =>
    request<LessonQueue>(`/jobs/${jobId}/lessons`, { method: "POST", body: JSON.stringify({ items }) }),
  lessonStatus: (jobId: string) => request<LessonQueue>(`/jobs/${jobId}/lessons`),
  interviewPrep: (jobTitle: string, company: string, jobDescription: string, stage: string) =>
    request("/ai/interview-prep", { method: "POST", body: JSON.stringify({ jobTitle, company, jobDescription, stage }) }),
  mockInterview: (jobTitle: string, jobDescription: string, resumeText: string, messages: any[]) =>
    request("/ai/mock-interview", { method: "POST", body: JSON.stringify({ jobTitle, jobDescription, resumeText, messages }) }),
  chat: (messages: any[], model?: string) =>
    request("/ai/chat", { method: "POST", body: JSON.stringify({ messages, model }) }),

  // JobSpy - real job scraping
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
