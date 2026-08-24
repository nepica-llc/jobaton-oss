import express from "express";
import cors from "cors";
import path from "node:path";
import { readCollection, writeCollection, upsert, remove, getSettings, saveSettings, getById, getProfile, saveProfile, getJobsByStatus } from "./storage.js";
import OpenAI from "openai";
import { v4 as uuid } from "uuid";

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

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
  res.json({ ok: true, data: readCollection("resumes") });
});

app.get("/api/resumes/:id", (req, res) => {
  const item = getById("resumes", req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: item });
});

app.post("/api/resumes", (req, res) => {
  const resume = { id: uuid(), ...req.body };
  upsert("resumes", resume);
  res.json({ ok: true, data: resume });
});

app.put("/api/resumes/:id", (req, res) => {
  const resume = { ...req.body, id: req.params.id };
  upsert("resumes", resume);
  res.json({ ok: true, data: resume });
});

app.delete("/api/resumes/:id", (req, res) => {
  remove("resumes", req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Cover Letters CRUD
// ---------------------------------------------------------------------------
app.get("/api/cover-letters", (_req, res) => {
  res.json({ ok: true, data: readCollection("cover_letters") });
});

app.post("/api/cover-letters", (req, res) => {
  const cl = { id: uuid(), ...req.body };
  upsert("cover_letters", cl);
  res.json({ ok: true, data: cl });
});

app.delete("/api/cover-letters/:id", (req, res) => {
  remove("cover_letters", req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
app.get("/api/profile", (_req, res) => {
  const profile = getProfile();
  res.json({ ok: true, data: profile });
});

app.put("/api/profile", (req, res) => {
  const saved = saveProfile(req.body);
  res.json({ ok: true, data: saved });
});

// ---------------------------------------------------------------------------
// Jobs CRUD
// ---------------------------------------------------------------------------
app.get("/api/jobs", (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ ok: true, data: getJobsByStatus(status) });
});

app.get("/api/jobs/:id", (req, res) => {
  const item = getById("jobs", req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: item });
});

app.post("/api/jobs", (req, res) => {
  const job = { id: uuid(), status: "saved", ...req.body };
  upsert("jobs", job);
  res.json({ ok: true, data: job });
});

app.put("/api/jobs/:id", (req, res) => {
  const job = { ...req.body, id: req.params.id };
  upsert("jobs", job);
  res.json({ ok: true, data: job });
});

app.delete("/api/jobs/:id", (req, res) => {
  remove("jobs", req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// AI helper — resolve API key + provider from settings
// ---------------------------------------------------------------------------
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

// Backwards compat wrapper
function getOpenAIClient(bodyKey?: string): OpenAI | null {
  const result = getAIClient(bodyKey);
  return result?.client || null;
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
    const content = completion.choices[0]?.message?.content || "";
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
      return res.status(400).json({ ok: false, error: "No API key configured. Go to Settings to add your OpenAI key." });
    }
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
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
    const raw = completion.choices[0]?.message?.content || "[]";
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
      return res.status(400).json({ ok: false, error: "No API key configured. Go to Settings to add your OpenAI key." });
    }
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
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
    const raw = completion.choices[0]?.message?.content || "{}";
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
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
    { "type": "skills", "name": "TECHNICAL SKILLS", "lines": ["Languages: Python, JavaScript, TypeScript", "Frameworks: React, Node.js, Django", "Tools: Docker, AWS, Git"] },
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
  "strategy": "brief overall approach"
}

CRITICAL RULES:
- structured_sections MUST include ALL sections from the original resume (don't drop any)
- Keep the same section order as the original resume
- Each section type is one of: header, summary, experience, skills, education, certifications, projects, other
- "entries" format is for sections with title/org/date/bullets (experience, education, projects)
- "lines" format is for simple text sections (summary, skills, certifications, header)
- Bullet points should be achievement-focused with metrics where possible
- Tailor content to match the job description keywords and requirements
- Include ALL jobs/education from original resume — do not remove any
- The "tailored_resume" field should still contain the full plain-text version as backup`
        },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` }
      ],
      temperature: 0.4,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are a professional cover letter writer. Write a compelling, personalized cover letter based on the resume and job description provided. Tone: ${tone || "professional"}. Output ONLY the cover letter text, no extra commentary.`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    });
    res.json({ ok: true, data: { coverLetter: completion.choices[0]?.message?.content || "" }, usage: completion.usage });
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
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
- Be thorough and specific in feedback — generic advice is useless
- Each section score should be 0-100
- skillGaps must list skills from the JD that are missing or underrepresented in the resume
- suggestions should be specific and actionable (e.g. "Add 'Kubernetes' to your skills section and mention container orchestration in your AWS experience bullet")
- strengths should highlight what the resume does well
- redFlags should note potential concerns a recruiter might have
- Provide at least 3 skillGaps, 5 suggestions, and 3 strengths`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/ats-score]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Study Guide (10 modules based on job requirements)
// ---------------------------------------------------------------------------
app.post("/api/ai/study-guide", async (req, res) => {
  try {
    const { jobTitle, company, jobDescription, apiKey } = req.body;
    const client = getOpenAIClient(apiKey);
    if (!client) {
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

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `JOB TITLE: ${jobTitle}\nCOMPANY: ${company || "Not specified"}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.5,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
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

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Module: ${moduleTitle}\nTopic: ${topic}\nJob: ${jobTitle}\nContext: ${jobDescription?.substring(0, 500) || ""}` },
      ],
      temperature: 0.6,
      max_tokens: 3000,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/study-content]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Generate Single Lesson (interactive training content)
// ---------------------------------------------------------------------------
app.post("/api/ai/generate-lesson", async (req, res) => {
  try {
    const { skill, jobTitle, company, lessonTitle, lessonType, allLessonTitles, sprintDuration = 1, apiKey } = req.body;
    const client = getOpenAIClient(apiKey);
    if (!client) return res.status(400).json({ ok: false, error: "No API key configured." });

    const systemPrompt = `You are an expert technical trainer creating comprehensive, in-depth learning content for job interview preparation.

Given a skill name, job title, company, and a lesson title, generate thorough, high-quality lesson content.

CRITICAL REQUIREMENTS:
- The lesson MUST have 5-7 sections minimum. Each section body MUST be at least 4-6 sentences with real substance.
- Include code snippets in at least 2 sections where relevant (practical code examples the learner can study).
- Include 5-7 keyPoints that summarize key takeaways.
- Include a detailed practicePrompt with clear step-by-step instructions (at least 3-4 sentences).
- If the lesson type is "quiz", include 8-10 MCQ questions covering different difficulty levels (easy, medium, hard).
- Make content practical and directly relevant to interview scenarios.
- Each section body should teach a concept thoroughly — imagine you're writing a textbook section, not a bullet point.
- Include real-world analogies, best practices, common pitfalls, and interview tips in the body text.

Return ONLY valid JSON:
{
  "title": "exact lesson title",
  "sections": [
    {"heading": "Section heading", "body": "Thorough multi-paragraph explanation. Minimum 4-6 sentences with real depth. Include examples, best practices, and common pitfalls.", "codeSnippet": "optional but encouraged — include practical code examples"}
  ],
  "keyPoints": ["Key takeaway 1", "Key takeaway 2", "...at least 5"],
  "practicePrompt": "A detailed hands-on exercise with clear steps (empty string if quiz lesson)",
  "quiz": [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]
}

Rules:
- If lesson type is "quiz", fill the quiz array with 8-10 questions and leave practicePrompt empty
- Otherwise fill practicePrompt and leave quiz as empty array
- NEVER produce fewer than 5 sections
- NEVER produce shallow one-sentence section bodies — each must be substantive
- Return ONLY valid JSON, no markdown, no commentary`;

    const userPrompt = `SKILL: ${skill}\nJOB TITLE: ${jobTitle}\nCOMPANY: ${company || "Company"}\nLESSON TYPE: ${lessonType}\n\nGENERATE THIS LESSON:\n${lessonTitle}\n\nALL LESSONS IN MODULE:\n${(allLessonTitles || []).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      max_tokens: 6000,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const lesson = parsed.lessons?.[0] || parsed.lesson || parsed;
    res.json({ ok: true, data: { lesson }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/generate-lesson]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// AI: Interview Prep
// ---------------------------------------------------------------------------
app.post("/api/ai/interview-prep", async (req, res) => {
  try {
    const { jobTitle, company, jobDescription, apiKey } = req.body;
    const client = getOpenAIClient(apiKey);
    if (!client) {
      return res.status(400).json({ ok: false, error: "No API key configured." });
    }
    const systemPrompt = `You are an interview preparation coach. Generate comprehensive interview preparation with EXACTLY 30 multiple-choice questions organized by difficulty.

Output as JSON:
{
  "overview": "Brief role assessment and what to expect in the interview",
  "rounds": [
    {
      "name": "Easy Round",
      "difficulty": "easy",
      "description": "Foundational concepts and basic knowledge",
      "duration": "10 minutes",
      "questions": [
        { "question": "Clear question text?", "options": [{"label": "Answer A", "correct": true}, {"label": "Answer B", "correct": false}, {"label": "Answer C", "correct": false}, {"label": "Answer D", "correct": false}], "explanation": "Why the correct answer is right", "timeLimit": 30 }
      ]
    },
    {
      "name": "Medium Round",
      "difficulty": "medium",
      "description": "Applied knowledge and scenario-based questions",
      "duration": "15 minutes",
      "questions": [ ...same format, 10 questions... ]
    },
    {
      "name": "Hard Round",
      "difficulty": "hard",
      "description": "Advanced concepts, system design, and complex problem-solving",
      "duration": "20 minutes",
      "questions": [ ...same format, 10 questions... ]
    }
  ],
  "tips": ["tip1", "tip2", "tip3"]
}

CRITICAL RULES:
- EXACTLY 3 rounds: Easy, Medium, Hard
- EXACTLY 10 questions per round (30 total)
- Every question MUST have exactly 4 options with ONE correct answer marked
- Each option MUST be an object with "label" (string) and "correct" (boolean)
- Include "explanation" for each question explaining the correct answer
- Easy questions: definitions, basic concepts, simple recall
- Medium questions: application, scenarios, "what would you do" situations
- Hard questions: system design, architecture decisions, complex trade-offs, debugging scenarios
- Questions should mix technical and behavioral relevant to the role
- timeLimit: 120 for easy, 180 for medium, 300 for hard (in seconds)`;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `JOB TITLE: ${jobTitle}\nCOMPANY: ${company || "Not specified"}\n\nJOB DESCRIPTION:\n${jobDescription}` },
      ],
      temperature: 0.5,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content || "{}";
    res.json({ ok: true, data: JSON.parse(content), usage: completion.usage });
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
    const client = getOpenAIClient(apiKey);
    if (!client) {
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
      { role: "user", content: `Context — Resume: ${resumeText}\nJob Description: ${jobDescription}` },
      ...(chatHistory || []),
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });
    res.json({ ok: true, data: { content: completion.choices[0]?.message?.content || "" }, usage: completion.usage });
  } catch (err: any) {
    console.error("[ai/mock-interview]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Serve frontend in production
// ---------------------------------------------------------------------------
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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[jobaton-oss] API running on http://0.0.0.0:${PORT}`);
});
