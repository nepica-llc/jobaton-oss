// Run: pnpm --filter api test
import assert from "node:assert/strict";
import { guardTailoredResume } from "./resumeGuard.js";

const resume = `Jane Doe
EDUCATION
B.S. Computer Science, University of Texas at Austin, 2015
CERTIFICATIONS
Okta Certified Professional (2021)
SKILLS
Okta, SAML, SCIM, Python`;

const { sections, removed } = guardTailoredResume(
  [
    { type: "education", name: "EDUCATION", entries: [
      { title: "Bachelor of Science in Computer Science", org: "University of Texas at Austin", bullets: [] },
      { title: "M.S. Cybersecurity", org: "Stanford University", bullets: [] },
    ] },
    { type: "certifications", name: "CERTIFICATIONS", lines: ["Okta Certified Professional (2021)", "CISSP (2023)", "AWS Certified Solutions Architect"] },
    { type: "skills", name: "SKILLS", lines: ["Okta", "SAML", "SCIM", "Python"] },
    { type: "projects", name: "PROJECTS", entries: [{ title: "X" }] },
  ],
  resume,
);

assert.equal(sections[0].entries.length, 1, "real degree kept, invented one dropped");
assert.deepEqual(sections[1].lines, ["Okta Certified Professional (2021)"], "only the real certificate kept");
assert.deepEqual(sections[2].lines, ["Skills: Okta, SAML, SCIM, Python"], "single skills grouped");
assert.equal(sections[3].type, "projects", "other sections untouched");
assert.equal(removed.length, 3);

// A section left empty is removed rather than shown as a bare heading.
const empty = guardTailoredResume([{ type: "certifications", name: "CERTIFICATIONS", lines: ["CISSP"] }], "no certs here");
assert.equal(empty.sections.length, 0);

console.log("resumeGuard ok");
