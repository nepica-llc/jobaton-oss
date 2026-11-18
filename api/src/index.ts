import express from "express";
import cors from "cors";
import path from "node:path";
import { readCollection, upsert, remove, getSettings, saveSettings, getById, getProfile, saveProfile, getJobsByStatus, listProfiles, profileExists, createProfile, renameProfile, resetProfile, deleteProfile } from "./storage.js";
import OpenAI from "openai";
import { guardTailoredResume } from "./resumeGuard.js";
import { v4 as uuid } from "uuid";

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;
// Localhost by default; the Docker image sets HOST=0.0.0.0 and compose publishes on 127.0.0.1 only.
const HOST = process.env.HOST || "127.0.0.1";

// UI is served same-origin (Vite proxy in dev, static in Docker), so cross-origin is off unless CORS_ORIGIN is set.
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Active profile: the web app sends X-Profile-Id; data routes are scoped to it.
// ---------------------------------------------------------------------------
app.use("/api", (req, res, next) => {
  const pid = req.header("x-profile-id") || "default";
  // Profile list, settings and health don't depend on the profile, so a stale id must not block them.
  if (!profileExists(pid) && !/^\/(profiles|settings|health)/.test(req.path)) return res.status(404).json({ ok: false, error: "Profile not found" });
  res.locals.pid = pid;
  next();
});
const pid = (res: express.Response): string => res.locals.pid;

// ---------------------------------------------------------------------------
// Profiles (list, create, rename, delete)
// ---------------------------------------------------------------------------
app.get("/api/profiles", (_req, res) => {
  res.json({ ok: true, data: listProfiles() });
});

app.post("/api/profiles", (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ ok: false, error: "Profile name is required" });
  res.json({ ok: true, data: createProfile(uuid(), name) });
});

app.put("/api/profiles/:id", (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 60);
  if (!name) return res.status(400).json({ ok: false, error: "Profile name is required" });
  if (!renameProfile(req.params.id, name)) return res.status(404).json({ ok: false, error: "Profile not found" });
  res.json({ ok: true, data: { id: req.params.id, name } });
});

app.post("/api/profiles/:id/reset", (req, res) => {
  if (!profileExists(req.params.id)) return res.status(404).json({ ok: false, error: "Profile not found" });
  resetProfile(req.params.id);
  res.json({ ok: true });
});

app.delete("/api/profiles/:id", (req, res) => {
  if (req.params.id === "default") return res.status(400).json({ ok: false, error: "The default profile cannot be deleted" });
  deleteProfile(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, version: "1.0.0" });
});

// ---------------------------------------------------------------------------
// Settings (API key, preferences)
// ---------------------------------------------------------------------------
app.get("/api/settings", (_req, res) => {
  const settings = getSettings();
  // Mask all provider API keys
  const keyFields = ["openai_key", "anthropic_key", "google_key", "mistral_key"];
  for (const field of keyFields) {
    if (settings[field]) {
      settings[`${field}_masked`] = settings[field].slice(0, 7) + "..." + settings[field].slice(-4);
      delete settings[field];
    }
  }
  res.json({ ok: true, data: settings });
});

app.post("/api/settings", (req, res) => {
  saveSettings(req.body);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Resumes CRUD
// ---------------------------------------------------------------------------
app.get("/api/resumes", (_req, res) => {
  res.json({ ok: true, data: readCollection("resumes", pid(res)) });
});

app.get("/api/resumes/:id", (req, res) => {
  const item = getById("resumes", req.params.id, pid(res));
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: item });
});

app.post("/api/resumes", (req, res) => {
  const resume = { id: uuid(), ...req.body };
  upsert("resumes", resume, pid(res));
  res.json({ ok: true, data: resume });
});

app.put("/api/resumes/:id", (req, res) => {
  const resume = { ...req.body, id: req.params.id };
  upsert("resumes", resume, pid(res));
  res.json({ ok: true, data: resume });
});

app.delete("/api/resumes/:id", (req, res) => {
  remove("resumes", req.params.id, pid(res));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Cover Letters CRUD
// ---------------------------------------------------------------------------
app.get("/api/cover-letters", (_req, res) => {
  res.json({ ok: true, data: readCollection("cover_letters", pid(res)) });
});

app.post("/api/cover-letters", (req, res) => {
  const cl = { id: uuid(), ...req.body };
  upsert("cover_letters", cl, pid(res));
  res.json({ ok: true, data: cl });
});

app.delete("/api/cover-letters/:id", (req, res) => {
  remove("cover_letters", req.params.id, pid(res));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
app.get("/api/profile", (_req, res) => {
  const profile = getProfile(pid(res));
  res.json({ ok: true, data: profile });
});

app.put("/api/profile", (req, res) => {
  const saved = saveProfile(req.body, pid(res));
  res.json({ ok: true, data: saved });
});

// ---------------------------------------------------------------------------
// Jobs CRUD
// ---------------------------------------------------------------------------
app.get("/api/jobs", (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ ok: true, data: getJobsByStatus(pid(res), status) });
});

app.get("/api/jobs/:id", (req, res) => {
  const item = getById("jobs", req.params.id, pid(res));
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: item });
});

app.post("/api/jobs", (req, res) => {
  const job = { id: uuid(), status: "saved", ...req.body };
  upsert("jobs", job, pid(res));
  res.json({ ok: true, data: job });
});

app.put("/api/jobs/:id", (req, res) => {
  const job = { ...req.body, id: req.params.id };
  keepServerLessons(job, getById("jobs", req.params.id, pid(res)));
  upsert("jobs", job, pid(res));
  res.json({ ok: true, data: job });
});

// Lessons are written by the server in the background (see runLessonQueue). A save from a browser
// that has not picked them up yet would otherwise send them back empty.
function keepServerLessons(incoming: any, stored: any) {
  const inMods = incoming?.prep_data?.study_guide?.training;
  const oldMods = stored?.prep_data?.study_guide?.training;
  if (!Array.isArray(inMods) || !Array.isArray(oldMods)) return;
  inMods.forEach((m: any, mi: number) => m?.lessons?.forEach((l: any, li: number) => {
    const old = oldMods[mi]?.lessons?.[li];
    if (oldMods[mi]?.title === m.title && old?.title === l?.title && old.sections?.length && !l.sections?.length) {
      Object.assign(l, { sections: old.sections, keyPoints: old.keyPoints, practicePrompt: old.practicePrompt, quiz: old.quiz });
    }
  }));
}

app.delete("/api/jobs/:id", (req, res) => {
  remove("jobs", req.params.id, pid(res));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// AI helper - resolve API key + provider from settings
// ---------------------------------------------------------------------------
// The UI never shows em dashes, so strip them from AI output too.
const DASH = String.fromCharCode(0x2014);
const noDash = (s: string) => s.split(` ${DASH} `).join(", ").split(DASH).join("-");

function getAIClient(bodyKey?: string): { client: OpenAI; model: string } | null {
  const settings = getSettings();
  const provider = settings.active_provider || "openai";
  let key: string | undefined;
  let baseURL: string | undefined;
  let defaultModel = "gpt-4o-mini";

  switch (provider) {
    case "anthropic":
      key = bodyKey || settings.anthropic_key || process.env.ANTHROPIC_API_KEY;
      baseURL = "https://api.anthropic.com/v1";
      defaultModel = "claude-sonnet-4-20250514";
      break;
    case "google":
      key = bodyKey || settings.google_key || process.env.GOOGLE_AI_KEY;
      baseURL = "https://generativelanguage.googleapis.com/v1beta/openai";
      defaultModel = "gemini-2.0-flash";
      break;
    case "mistral":
      key = bodyKey || settings.mistral_key || process.env.MISTRAL_API_KEY;
      baseURL = "https://api.mistral.ai/v1";
      defaultModel = "mistral-large-latest";
      break;
    default:
      key = bodyKey || settings.openai_key || process.env.OPENAI_API_KEY;
      defaultModel = settings.openai_model || "gpt-4o-mini";
      break;
  }

  if (!key) return null;
  const client = new OpenAI({ apiKey: key, ...(baseURL ? { baseURL } : {}) });
  return { client, model: defaultModel };
}

// ---------------------------------------------------------------------------
// AI: Chat completion (generic endpoint used by all features)
// ---------------------------------------------------------------------------
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured. Go to Settings to add your AI provider key." });
    }
    const completion = await ai.client.chat.completions.create({
      model: model || ai.model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens || 4096,
    });
    const content = noDash(completion.choices[0]?.message?.content || "");
    res.json({
      ok: true,
      data: { content },
      usage: completion.usage,
    });
  } catch (err: any) {
    console.error("[ai/chat]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Search Jobs (generate job leads based on profile/skills)
// ---------------------------------------------------------------------------
app.post("/api/ai/search-jobs", async (req, res) => {
  try {
    const { skills, title, location, experience, preferences, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured. Go to Settings to add your AI provider key." });
    }
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "system",
          content: `You are a job search assistant. Based on the candidate's profile, suggest 10 realistic job openings they should look for. Return ONLY valid JSON array with this shape:
[{"title":"job title","company":"likely company or type","location":"location","salary":"estimated range","why":"1-sentence reason this is a good fit","search_query":"suggested Google/LinkedIn search query for this role"}]
Be specific and realistic. Use current market trends. Vary the companies and roles.`
        },
        { role: "user", content: `Candidate profile:\n- Current/desired title: ${title || "Software Engineer"}\n- Skills: ${skills || "Not specified"}\n- Location preference: ${location || "Remote"}\n- Experience level: ${experience || "Mid-level"}\n- Preferences: ${preferences || "None specified"}` }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });
    const raw = noDash(completion.choices[0]?.message?.content || "[]");
    const parsed = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    res.json({ ok: true, data: parsed, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/search-jobs]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// JobSpy: Real job search via python-jobspy service
// ---------------------------------------------------------------------------
app.get("/api/jobspy/search", async (req, res) => {
  try {
    const jobspyUrl = process.env.JOBSPY_URL || "http://jobspy:8090";
    const params = new URLSearchParams();
    if (req.query.search_term) params.set("search_term", req.query.search_term as string);
    if (req.query.location) params.set("location", req.query.location as string);
    if (req.query.results_wanted) params.set("results_wanted", req.query.results_wanted as string);
    if (req.query.site_name) params.set("site_name", req.query.site_name as string);
    if (req.query.force_refresh) params.set("force_refresh", req.query.force_refresh as string);

    const response = await fetch(`${jobspyUrl}/search?${params.toString()}`);
    const data = await response.json();
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error("[jobspy/search]", err.message);
    res.status(500).json({ ok: false, error: `JobSpy service unavailable: ${err.message}`, jobs: [] });
  }
});

app.delete("/api/jobspy/cache", async (_req, res) => {
  try {
    const jobspyUrl = process.env.JOBSPY_URL || "http://jobspy:8090";
    const response = await fetch(`${jobspyUrl}/cache`, { method: "DELETE" });
    const data = await response.json();
    res.json({ ok: true, ...data });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Parse Job Description → structured data
// ---------------------------------------------------------------------------
app.post("/api/ai/parse-job", async (req, res) => {
  try {
    const { rawDescription, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured. Go to Settings to add your AI provider key." });
    }
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "system",
          content: `You extract structured job information from raw job postings. Return ONLY valid JSON with these fields:
{
  "title": "job title",
  "company": "company name",
  "location": "location or Remote",
  "salary": "salary range if mentioned, or empty string",
  "requirements": ["list", "of", "key", "requirements"],
  "nice_to_have": ["optional", "skills"],
  "description_summary": "2-3 sentence summary of the role"
}
If a field is not found, use an empty string or empty array. Never add commentary outside the JSON.`
        },
        { role: "user", content: rawDescription }
      ],
      temperature: 0.2,
      max_tokens: 1024,
    });
    const raw = noDash(completion.choices[0]?.message?.content || "{}");
    const parsed = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    res.json({ ok: true, data: parsed, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/parse-job]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Tailor Resume to Job Description
// ---------------------------------------------------------------------------
app.post("/api/ai/tailor-resume", async (req, res) => {
  try {
    const { resumeText, jobDescription, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "system",
          content: `You are an expert resume writer. Given a resume and a job description, produce a tailored resume with structured sections.

Format as JSON:
{
  "tailored_resume": "the complete resume as formatted text with clear section headers",
  "structured_sections": [
    { "type": "header", "name": "", "lines": ["Full Name", "email@example.com | (555) 123-4567 | City, State | linkedin.com/in/username"] },
    { "type": "summary", "name": "PROFESSIONAL SUMMARY", "lines": ["2-3 sentence tailored summary paragraph"] },
    { "type": "experience", "name": "PROFESSIONAL EXPERIENCE", "entries": [
      { "title": "Job Title", "org": "Company Name", "date": "Jan 2020 - Present", "location": "City, State", "bullets": ["Achievement-focused bullet 1", "Achievement-focused bullet 2", "Achievement-focused bullet 3"] }
    ]},
    { "type": "skills", "name": "TECHNICAL SKILLS", "lines": ["Identity & Access: Okta, Azure AD, SAML, OIDC, SCIM", "Cloud & Infrastructure: AWS, Terraform, Docker", "Languages: Python, PowerShell, SQL"] },
    { "type": "education", "name": "EDUCATION", "entries": [
      { "title": "Degree Name", "org": "University Name", "date": "2016 - 2020", "location": "City, State", "bullets": [] }
    ]},
    { "type": "certifications", "name": "CERTIFICATIONS", "lines": ["AWS Solutions Architect (2023)", "Google Cloud Professional (2022)"] },
    { "type": "projects", "name": "PROJECTS", "entries": [
      { "title": "Project Name", "org": "", "date": "", "location": "", "bullets": ["Description of project and impact"] }
    ]}
  ],
  "changes_summary": ["list of key changes made"],
  "keywords_added": ["keywords incorporated"],
  "strategy": "brief overall approach",
  "credential_questions": [
    { "requirement": "Bachelor's degree in Computer Science or related field", "question": "This role asks for a degree in Computer Science or a related field. Do you have a related degree or coursework?" }
  ]
}

CRITICAL RULES:
- structured_sections MUST include ALL sections from the original resume (don't drop any)
- Keep the same section order as the original resume
- Each section type is one of: header, summary, experience, skills, education, certifications, projects, other
- "entries" format is for sections with title/org/date/bullets (experience, education, projects)
- "lines" format is for simple text sections (summary, skills, certifications, header)
- Bullet points should be achievement-focused with metrics where possible
- Tailor content to match the job description keywords and requirements
- Include ALL jobs/education from original resume - do not remove any
- The "tailored_resume" field should still contain the full plain-text version as backup

HONESTY RULES (never break these):
- Never invent education, degrees, schools, certifications, licenses, employers, job titles or dates. Only use ones that appear in the RESUME or under CANDIDATE-CONFIRMED CREDENTIALS.
- You may reword or reorder real items, never add new ones.
- If the job requires or prefers a degree, certification or license that the resume does not show, do NOT add it. Add an entry to "credential_questions" instead, asking the candidate whether they have it or something related. Use an empty array when nothing is missing.

SKILLS FORMAT:
- Group skills into 3 to 6 category lines, each "Category: skill, skill, skill" (for example "Identity & Access: Okta, SAML, SCIM").
- Never put one skill per line. Put the skills that match the job description first.`
        },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` }
      ],
      temperature: 0.4,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });
    const raw = noDash(completion.choices[0]?.message?.content || "{}");
    const parsed = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    // Enforce the honesty rules: anything not in the resume is dropped and turned into a question.
    const guard = guardTailoredResume(parsed.structured_sections, resumeText);
    parsed.structured_sections = guard.sections;
    const questions = Array.isArray(parsed.credential_questions) ? parsed.credential_questions.filter((q: any) => q?.question) : [];
    for (const item of guard.removed) {
      questions.push({ requirement: item, question: `The AI tried to add "${item}", which is not on your resume. Do you have it, or something related?` });
    }
    parsed.credential_questions = questions;
    res.json({ ok: true, data: parsed, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/tailor-resume]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Cover Letter
// ---------------------------------------------------------------------------
app.post("/api/ai/cover-letter", async (req, res) => {
  try {
    const { jobDescription, resumeText, tone, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are a professional cover letter writer. Write a compelling, personalized cover letter based on the resume and job description provided. Tone: ${tone || "professional"}. Output ONLY the cover letter text, no extra commentary.`;
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });
    res.json({ ok: true, data: { coverLetter: noDash(completion.choices[0]?.message?.content || "") }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/cover-letter]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: ATS Score
// ---------------------------------------------------------------------------
app.post("/api/ai/ats-score", async (req, res) => {
  try {
    const { resumeText, jobDescription, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are an ATS (Applicant Tracking System) expert and hiring manager. Perform a thorough analysis of the resume against the job description.

Output as JSON with this EXACT structure:
{
  "score": number (0-100),
  "verdict": "Strong Match" | "Good Match" | "Needs Work" | "Weak Match",
  "summary": "2-3 sentence assessment explaining WHY this score was given and the candidate's overall fit",
  "keywordMatches": ["keyword1", "keyword2"],
  "missingKeywords": ["keyword1", "keyword2"],
  "skillGaps": [
    { "skill": "skill name", "importance": "critical" | "important" | "nice-to-have", "suggestion": "how to address this gap" }
  ],
  "sections": {
    "summary": { "score": number, "feedback": "detailed feedback on the resume summary/objective section", "improvements": ["specific improvement 1", "specific improvement 2"] },
    "experience": { "score": number, "feedback": "detailed feedback on work experience relevance and impact", "improvements": ["specific improvement 1", "specific improvement 2"] },
    "skills": { "score": number, "feedback": "detailed feedback on skills match and presentation", "improvements": ["specific improvement 1", "specific improvement 2"] },
    "education": { "score": number, "feedback": "detailed feedback on education and certifications", "improvements": ["specific improvement 1"] },
    "formatting": { "score": number, "feedback": "ATS parsing compatibility assessment", "improvements": ["specific improvement 1"] }
  },
  "suggestions": ["actionable suggestion 1", "actionable suggestion 2", "actionable suggestion 3", "actionable suggestion 4", "actionable suggestion 5"],
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "redFlags": ["potential concern 1"]
}

RULES:
- Be thorough and specific in feedback - generic advice is useless
- Each section score should be 0-100
- skillGaps must list skills from the JD that are missing or underrepresented in the resume
- suggestions should be specific and actionable (e.g. "Add 'Kubernetes' to your skills section and mention container orchestration in your AWS experience bullet")
- strengths should highlight what the resume does well
- redFlags should note potential concerns a recruiter might have
- Provide at least 3 skillGaps, 5 suggestions, and 3 strengths`;
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    const content = noDash(completion.choices[0]?.message?.content || "{}");
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/ats-score]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Company facts (shown while other AI work runs, so the wait is useful)
// ---------------------------------------------------------------------------
app.post("/api/ai/company-facts", async (req, res) => {
  try {
    const { company, jobTitle, jobDescription, apiKey } = req.body;
    if (!company || typeof company !== "string") return res.status(400).json({ ok: false, error: "Company is required" });
    const ai = getAIClient(apiKey);
    if (!ai) return res.status(400).json({ ok: false, error: "No API key configured." });
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "system",
          content: `You help a candidate prepare for an interview. Give 8 short facts about the company that are useful to know before interviewing: what it does, main products or services, customers, size or headquarters, recent direction, culture or values, and how this role fits in.
Rules:
- One sentence each, at most 25 words, plain and specific.
- Only state facts you are confident are accurate. Never guess numbers or dates.
- If you do not know the company well, use the job description instead and start those facts with "From the job post:".
Return JSON: {"facts": ["...", "..."]}`,
        },
        { role: "user", content: `COMPANY: ${company}\nROLE: ${jobTitle || ""}\n\nJOB DESCRIPTION:\n${String(jobDescription || "").slice(0, 4000)}` },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(noDash(completion.choices[0]?.message?.content || "{}"));
    const facts = (Array.isArray(parsed.facts) ? parsed.facts : []).filter((f: unknown) => typeof f === "string" && f.trim()).slice(0, 10);
    res.json({ ok: true, data: { facts }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/company-facts]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Study Guide (10 modules based on job requirements)
// ---------------------------------------------------------------------------
app.post("/api/ai/study-guide", async (req, res) => {
  try {
    const { jobTitle, company, jobDescription, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are a technical learning coach. Based on the job description, create a study guide with EXACTLY 10 modules (no more, no less) that a candidate should complete to be fully prepared for this role.

IMPORTANT RULES:
- You MUST produce exactly 10 modules in the "modules" array.
- Every module MUST have a title, description, duration, at least 2 topics, and at least 3 learning activities.
- Do NOT include any external URLs or links. All learning content will be generated interactively by AI.
- Activities should describe what the learner will do (e.g. "Learn about X", "Practice Y", "Quiz on Z").
- Do NOT leave any field empty or null.

Output as JSON:
{
  "title": "Study Guide for [role]",
  "estimated_total_hours": number,
  "modules": [
    {
      "number": 1,
      "title": "Module title",
      "description": "What this module covers and why it matters for the role",
      "duration": "estimated hours (e.g. 3-4 hours)",
      "topics": ["topic1", "topic2"],
      "activities": [
        {"type": "learn|practice|quiz|build|explore", "title": "Activity title", "description": "What the learner will do"}
      ],
      "success_criteria": "How to know you've mastered this module"
    }
  ]
}

Make modules progressively build on each other. Include a mix of conceptual learning, hands-on practice, and quizzes.`;

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `JOB TITLE: ${jobTitle}\nCOMPANY: ${company || "Not specified"}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.5,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    const content = noDash(completion.choices[0]?.message?.content || "{}");
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/study-guide]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Study Guide – Interactive Content (deep dive, quiz, explain)
// ---------------------------------------------------------------------------
app.post("/api/ai/study-content", async (req, res) => {
  try {
    const { mode, topic, moduleTitle, jobTitle, jobDescription, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }

    let systemPrompt = "";
    if (mode === "quiz") {
      systemPrompt = `You are a quiz master. Generate an interactive quiz about "${topic}" in the context of a ${jobTitle} role. 
Output as JSON:
{
  "title": "Quiz: ${topic}",
  "questions": [
    {"question": "...", "options": ["A) ...", "B) ...", "C) ...", "D) ..."], "correct": 0, "explanation": "Why this is correct"}
  ]
}
Generate 5 questions. Mix difficulty levels. Make them practical and relevant to the job.`;
    } else if (mode === "deep-dive") {
      systemPrompt = `You are an expert technical instructor. Provide a detailed deep-dive lesson on "${topic}" specifically for someone preparing for a ${jobTitle} role.
Output as JSON:
{
  "title": "Deep Dive: ${topic}",
  "sections": [
    {"heading": "Section title", "content": "Detailed explanation with examples", "keyTakeaway": "One-line summary"}
  ],
  "practiceExercise": {"task": "A hands-on exercise", "hints": ["hint1"], "solution": "The solution explained"}
}
Provide 3-5 sections. Be thorough but clear. Include real-world examples relevant to the job.`;
    } else {
      systemPrompt = `You are a friendly tutor. Explain "${topic}" in a clear, concise way for someone preparing for a ${jobTitle} role.
Output as JSON:
{
  "title": "Learn: ${topic}",
  "explanation": "Clear explanation in 2-3 paragraphs",
  "keyPoints": ["point1", "point2", "point3"],
  "example": "A practical real-world example",
  "tryThis": "A simple exercise the learner can try right now"
}`;
    }

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Module: ${moduleTitle}\nTopic: ${topic}\nJob: ${jobTitle}\nContext: ${jobDescription?.substring(0, 500) || ""}` },
      ],
      temperature: 0.6,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });
    const content = noDash(completion.choices[0]?.message?.content || "{}");
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/study-content]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Study guide lessons. Generated on the server so they keep going (and are saved
// to the job) when the user leaves the page.
// ---------------------------------------------------------------------------
const LESSON_BRIEFS: Record<string, string> = {
  "Core Concepts": `Teach the fundamentals: what it is, why it exists, the key terms and how the parts fit together. Definitions belong here and nowhere else in the module.`,
  "Real-World Patterns": `Do NOT re-define basics. Teach how practitioners actually use this at work: common architectures and workflows, the trade-offs between approaches, failure modes, gotchas, and what a senior person does differently from a junior one. Name real tools and standards where relevant.`,
  "Scenario Practice": `This is NOT a concept lesson. Do NOT define terms or restate the basics. Every card is part of a concrete workplace scenario written like a short case: a named team or system, a specific symptom, constraint or request, and numbers where they help. Walk through 2 or 3 different scenarios (use the scenario name as the card heading): the situation, what a strong candidate checks first, the decision they make and why, and the mistake a weaker candidate would make.`,
  "Applied Scenarios": `This is NOT a concept lesson and must not repeat Scenario Practice. Use 2 or 3 harder scenarios set at this company and role: an incident, a design decision with competing requirements, or a stakeholder pushing back. For each, cover the situation, the options, the recommended approach with its trade-off, and how to explain it in an interview answer.`,
  "Knowledge Check": `A short recap only (4 to 6 cards of the most testable facts and decisions), then the quiz. The quiz carries this lesson.`,
};

async function generateLessonContent(ai: { client: OpenAI; model: string }, o: {
  skill: string; moduleDescription?: string; jobTitle: string; company: string; jobDescription?: string;
  lessonTitle: string; lessonType: string; allLessonTitles: string[]; alreadyCovered: string[];
}) {
  const brief = LESSON_BRIEFS[o.lessonTitle] || (o.lessonType === "practice" ? LESSON_BRIEFS["Scenario Practice"] : LESSON_BRIEFS["Core Concepts"]);
  const systemPrompt = `You are a world-class technical trainer and interview coach. You write study material that gets a candidate ready for a specific job interview: accurate, concrete and specific to the role, never generic filler.
You are writing ONE lesson of a module. Each lesson in the module has a different job; stay inside this lesson's job and never repeat what other lessons cover.

THIS LESSON'S JOB:
${brief}

CARDS:
- 8 to 12 cards in "sections". Each card "body" is ONE or TWO short sentences (at most 40 words). Never a paragraph.
- Each card makes one point. Use concrete, practical wording that sounds natural when read aloud.
- Group consecutive cards with the same "heading" when they cover the same concept or scenario.
- Add a short "codeSnippet" (at most 12 lines) to at most 2 cards, only where code or config genuinely helps.
- Tie examples to the role and company where it is natural.

QUESTIONS (every question must be gradeable):
- "quiz" contains ONLY multiple-choice questions with exactly 4 options and exactly one correct answer ("correctIndex", 0 to 3).
- Never ask open-ended, free-text or "explain in your own words" questions.
- Make wrong options plausible (common misconceptions), never joke answers. Vary which position holds the correct answer.
- Lesson type "read": 3 questions checking the cards.
- Lesson type "practice": 5 scenario questions. Each one describes a NEW situation (not one from the cards) in 2 or 3 sentences and asks which action, answer or fix is best.
- Lesson type "quiz": 8 questions mixing easy, medium and hard, at least half of them scenario-based.
- Each question has a one-sentence "explanation" of why the correct option is right.

Also include 3 to 5 short "keyPoints".

Return ONLY valid JSON:
{
  "title": "exact lesson title",
  "sections": [{"heading": "Concept or scenario name", "body": "One or two short sentences.", "codeSnippet": ""}],
  "keyPoints": ["Short takeaway"],
  "practicePrompt": "",
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "Why this is right."}]
}`;
  const userPrompt = [
    `MODULE (skill): ${o.skill}`,
    o.moduleDescription ? `MODULE FOCUS: ${o.moduleDescription}` : "",
    `JOB TITLE: ${o.jobTitle}`,
    `COMPANY: ${o.company || "the company"}`,
    `LESSON TYPE: ${o.lessonType}`,
    `GENERATE THIS LESSON: ${o.lessonTitle}`,
    `ALL LESSONS IN MODULE:\n${o.allLessonTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    o.alreadyCovered.length ? `ALREADY COVERED IN OTHER LESSONS (do not repeat these points):\n${o.alreadyCovered.slice(0, 40).map((h) => `- ${h}`).join("\n")}` : "",
    o.jobDescription ? `JOB DESCRIPTION (for context):\n${o.jobDescription.slice(0, 3000)}` : "",
  ].filter(Boolean).join("\n\n");

  const completion = await ai.client.chat.completions.create({
    model: ai.model,
    messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
    temperature: 0.6,
    max_tokens: 6000,
    response_format: { type: "json_object" },
  });
  const parsed = JSON.parse(noDash(completion.choices[0]?.message?.content || "{}"));
  const lesson = parsed.lessons?.[0] || parsed.lesson || parsed;
  const quiz = (Array.isArray(lesson.quiz) ? lesson.quiz : []).filter((q: any) =>
    q?.question && Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < 4);
  return {
    sections: Array.isArray(lesson.sections) ? lesson.sections : [],
    keyPoints: Array.isArray(lesson.keyPoints) ? lesson.keyPoints : [],
    practicePrompt: lesson.practicePrompt || "",
    quiz,
  };
}

// In-memory queue per job: "mod:lesson" keys waiting or running, and the last failures.
// shortcut: lost on server restart (the client just shows those lessons as not generated), fine for a single self-hosted instance.
// "fresh" holds keys the user asked to regenerate, replacing the existing lesson.
const lessonQueues = new Map<string, { pending: string[]; fresh: Set<string>; failed: { key: string; error: string }[]; running: boolean }>();

async function runLessonQueue(jobId: string, profileId: string, apiKey?: string) {
  const q = lessonQueues.get(jobId);
  if (!q || q.running) return;
  q.running = true;
  try {
    while (q.pending.length > 0) {
      const key = q.pending[0];
      const [mi, li] = key.split(":").map(Number);
      try {
        const ai = getAIClient(apiKey);
        if (!ai) throw new Error("No API key configured.");
        const job: any = getById("jobs", jobId, profileId);
        const mod = job?.prep_data?.study_guide?.training?.[mi];
        const lesson = mod?.lessons?.[li];
        if (!lesson) throw new Error("Lesson not found");
        const fresh = q.fresh.delete(key);
        if (fresh || !lesson.sections?.length) {
          const alreadyCovered: string[] = mod.lessons.flatMap((l: any, i: number) => (i === li ? [] : (l.sections || []).map((s: any) => s.heading))).filter((h: string, i: number, a: string[]) => h && a.indexOf(h) === i);
          const content = await generateLessonContent(ai, {
            skill: mod.skill || mod.title, moduleDescription: mod.description, jobTitle: job.title || "", company: job.company || "",
            jobDescription: job.raw_description || "", lessonTitle: lesson.title, lessonType: lesson.type,
            allLessonTitles: mod.lessons.map((l: any) => l.title), alreadyCovered,
          });
          if (!content.sections.length) throw new Error("The AI returned an empty lesson. Try again.");
          // Re-read: the user may have saved progress while the AI was working.
          const latest: any = getById("jobs", jobId, profileId);
          const target = latest?.prep_data?.study_guide?.training?.[mi]?.lessons?.[li];
          if (target && (fresh || !target.sections?.length)) {
            Object.assign(target, content);
            delete target.quizScore; // the old score was for the old questions
            upsert("jobs", latest, profileId);
          }
        }
      } catch (err: any) {
        console.error("[lessons]", jobId, key, err.message);
        q.failed.push({ key, error: err.message });
      }
      q.pending.shift();
    }
  } finally {
    q.running = false;
  }
}

app.post("/api/jobs/:id/lessons", (req, res) => {
  const job: any = getById("jobs", req.params.id, pid(res));
  if (!job) return res.status(404).json({ ok: false, error: "Not found" });
  if (!getAIClient(req.body?.apiKey)) return res.status(400).json({ ok: false, error: "No API key configured." });
  const items: unknown = req.body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return res.status(400).json({ ok: false, error: "items must be a list of {mod, lesson}" });
  const training = job.prep_data?.study_guide?.training;
  if (!Array.isArray(training)) return res.status(400).json({ ok: false, error: "Open the study guide once before generating lessons" });
  const q = lessonQueues.get(job.id) || { pending: [], fresh: new Set<string>(), failed: [], running: false };
  lessonQueues.set(job.id, q);
  q.failed = [];
  for (const it of items as any[]) {
    const mi = Number(it?.mod), li = Number(it?.lesson);
    if (!training[mi]?.lessons?.[li]) continue;
    const key = `${mi}:${li}`;
    if (it.fresh === true) q.fresh.add(key);
    if (!q.pending.includes(key)) q.pending.push(key);
  }
  runLessonQueue(job.id, pid(res), req.body?.apiKey);
  res.json({ ok: true, data: { pending: q.pending, failed: q.failed } });
});

app.get("/api/jobs/:id/lessons", (req, res) => {
  if (!getById("jobs", req.params.id, pid(res))) return res.status(404).json({ ok: false, error: "Not found" });
  const q = lessonQueues.get(req.params.id);
  res.json({ ok: true, data: { pending: q?.pending || [], failed: q?.failed || [] } });
});

// ---------------------------------------------------------------------------
// AI: Interview Prep
// ---------------------------------------------------------------------------
const INTERVIEW_STAGES: Record<string, { name: string; focus: string }> = {
  recruiter: {
    name: "Recruiter screen",
    focus: "a first call with a recruiter or talent partner: motivation, background walkthrough, role and company fit, salary expectations, notice period, work authorization, and how to talk about the role at a high level. Light on deep technical detail.",
  },
  hiring_manager: {
    name: "Hiring manager",
    focus: "a call with the hiring manager: past impact, ownership, prioritization, stakeholder management, handling conflict and failure, how the candidate would approach the first 90 days, and situational judgement for this team.",
  },
  technical: {
    name: "Technical",
    focus: "a technical round with engineers or specialists: core concepts, tools and practices from the job description, troubleshooting scenarios, design trade-offs and hands-on problem solving at the level this role needs.",
  },
  final: {
    name: "Final / culture",
    focus: "a final round with senior leaders or a panel: values and culture fit, strategic thinking, cross-team collaboration, leadership, long-term goals, and good questions to ask the company.",
  },
};

app.post("/api/ai/interview-prep", async (req, res) => {
  try {
    const { jobTitle, company, jobDescription, stage = "technical", interviewer, apiKey } = req.body;
    const stageInfo = INTERVIEW_STAGES[stage];
    if (!stageInfo) return res.status(400).json({ ok: false, error: "Unknown interview stage" });
    const interviewerText = typeof interviewer === "string" ? interviewer.trim().slice(0, 6000) : "";
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are an interview preparation coach. Prepare the candidate for ONE specific interview round: ${stageInfo.name}, which is ${stageInfo.focus}

Generate EXACTLY 12 multiple-choice questions for this round only, ordered from easier to harder.${interviewerText ? `

The candidate shared their interviewer's public profile. Use it to tailor the round: lean toward topics from the interviewer's background, current role and interests, and phrase questions the way someone in that position would ask them. Do not invent facts about the interviewer beyond what the profile says.` : ""}

Output as JSON:
{
  "overview": "2 to 3 sentences on what this round is for and what the interviewer will look for",
  "interviewerInsights": ${interviewerText ? `["3 to 5 short points on what this interviewer is likely to care about, based on their profile"]` : "[]"},
  "rounds": [
    {
      "name": "${stageInfo.name}",
      "questions": [
        { "question": "Clear question text?", "difficulty": "easy", "options": [{"label": "Answer A", "correct": true}, {"label": "Answer B", "correct": false}, {"label": "Answer C", "correct": false}, {"label": "Answer D", "correct": false}], "explanation": "Why the correct answer is the best response", "timeLimit": 120 }
      ]
    }
  ],
  "tips": ["3 to 5 tips specific to this round"]
}

CRITICAL RULES:
- EXACTLY 12 questions in the single round: 4 easy, 4 medium, 4 hard, with "difficulty" set on each
- Every question MUST have exactly 4 options with ONE correct answer marked
- Each option MUST be an object with "label" (string) and "correct" (boolean)
- For behavioral and situational questions, the options are possible responses and the correct one is the strongest response
- Include "explanation" for each question
- timeLimit: 120 for easy, 180 for medium, 300 for hard (in seconds)
- Keep every question relevant to this round and this job`;
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `JOB TITLE: ${jobTitle}\nCOMPANY: ${company || "Not specified"}\n\nJOB DESCRIPTION:\n${jobDescription}${interviewerText ? `\n\nINTERVIEWER PROFILE (pasted by the candidate):\n${interviewerText}` : ""}` },
      ],
      temperature: 0.5,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });
    const content = noDash(completion.choices[0]?.message?.content || "{}");
    res.json({ ok: true, data: { ...JSON.parse(content), stage, hasInterviewer: !!interviewerText }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/interview-prep]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Mock Interview
// ---------------------------------------------------------------------------
app.post("/api/ai/mock-interview", async (req, res) => {
  try {
    const { jobTitle, jobDescription, resumeText, messages: chatHistory, apiKey } = req.body;
    const ai = getAIClient(apiKey);
    if (!ai) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are conducting a mock interview for the position of ${jobTitle}. 
You are the interviewer. Ask one question at a time. After the candidate answers, provide brief feedback and then ask the next question.
Mix behavioral (STAR method) and technical questions relevant to the job description.
Be encouraging but honest. If the candidate's answer is weak, suggest improvements.
Start by introducing yourself and asking the first question.
Keep responses concise (2-3 paragraphs max).`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Context - Resume: ${resumeText}\nJob Description: ${jobDescription}` },
      ...(chatHistory || []),
    ];

    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
    res.json({ ok: true, data: { content: noDash(completion.choices[0]?.message?.content || "") }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/mock-interview]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Serve frontend in production
// ---------------------------------------------------------------------------
app.use("/api", (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err.message === "Not found" ? 404 : 500).json({ ok: false, error: err.message });
});

if (process.env.NODE_ENV === "production") {
  const staticDir = path.resolve(process.cwd(), "public");
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, HOST, () => {
  console.log(`[jobaton-oss] API running on http://${HOST}:${PORT}`);
});
