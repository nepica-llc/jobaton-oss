import { api } from "./api";

// Reading an uploaded resume and filling the profile from it. Used by the Resumes page,
// the Profile page and the first-run welcome screen.

export interface ResumeData {
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

export const emptyResume: ResumeData = {
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

export async function extractTextFromPdf(file: File): Promise<string> {
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
}

export async function parseResumeText(text: string): Promise<ResumeData> {
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
- Extract ALL sections from the resume - do not skip certifications, projects, languages, volunteer work, publications, awards, or any other section
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
}

export function generateResumeName(parsed: ResumeData, existingCount: number): string {
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

function inferExperienceLevel(experience: any[]): string {
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
}

/** Profile fields taken from a resume. Values the resume does not have keep what the profile already had. */
export function profileFromResume<T extends Record<string, any>>(profile: T, resume: any): T {
  return {
    ...profile,
    fullName: resume.fullName || profile.fullName,
    email: resume.email || profile.email,
    phone: resume.phone || profile.phone,
    location: resume.location || profile.location,
    linkedin: resume.linkedin || profile.linkedin,
    github: resume.github || profile.github,
    portfolio: resume.portfolio || profile.portfolio,
    headline: resume.experience?.[0]?.title || profile.headline,
    skills: (resume.skills || []).join(", ") || profile.skills,
    experience: inferExperienceLevel(resume.experience) || profile.experience,
  };
}
