// Safety net for AI-tailored resumes: the prompt forbids inventing credentials, this enforces it.

// Words that appear in many degree, school and certificate names and so prove nothing on their own.
const GENERIC = new Set([
  "the", "and", "for", "with", "university", "college", "institute", "school", "academy", "state",
  "bachelor", "bachelors", "master", "masters", "degree", "science", "sciences", "arts", "associate",
  "certified", "certification", "certificate", "professional", "expert", "specialist", "foundation",
  "present", "expected", "online", "campus",
]);

const tokens = (s: string) =>
  (s.toLowerCase().match(/[a-z0-9+#]+/g) || []).filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !GENERIC.has(t));

// True when every distinctive word of `text` already appears in the source resume.
function grounded(text: string, source: string): boolean {
  const words = tokens(text);
  return words.length > 0 && words.every((w) => source.includes(w));
}

// Drops education entries and certification lines that are not in the original resume, and
// groups a one-skill-per-line skills section into a single line. Returns what was removed.
export function guardTailoredResume(sections: any[], resumeText: string): { sections: any[]; removed: string[] } {
  const source = resumeText.toLowerCase();
  const removed: string[] = [];
  const out = (Array.isArray(sections) ? sections : []).map((sec) => {
    if (sec?.type === "education" && Array.isArray(sec.entries)) {
      const entries = sec.entries.filter((e: any) => {
        const ok = grounded(e.org || e.title || "", source);
        if (!ok) removed.push([e.title, e.org].filter(Boolean).join(", "));
        return ok;
      });
      return { ...sec, entries };
    }
    if (sec?.type === "certifications" && Array.isArray(sec.lines)) {
      const lines = sec.lines.filter((l: string) => {
        const ok = grounded(String(l).replace(/\(.*?\)/g, ""), source);
        if (!ok) removed.push(String(l));
        return ok;
      });
      return { ...sec, lines };
    }
    if (sec?.type === "skills" && Array.isArray(sec.lines) && sec.lines.length > 3 && sec.lines.every((l: string) => !String(l).includes(":") && !String(l).includes(","))) {
      return { ...sec, lines: [`Skills: ${sec.lines.join(", ")}`] };
    }
    return sec;
  });
  return { sections: out.filter((s) => !(s?.type === "education" || s?.type === "certifications") || (s.entries?.length || s.lines?.length)), removed };
}
