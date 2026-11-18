// Run: pnpm --filter api test
import assert from "node:assert/strict";
import { checkRequirements, keywordCoverage, computeAtsScore, studyCoverage } from "./scoring.js";

const resume = `Jane Doe. IAM Engineer at Initrode 2019-present.
Administered Okta for 3,000 users and built SCIM provisioning to Workday.
Skills: Okta, SAML, Python, Node.js, C#`;
const jd = `We need 5+ years with Okta and SAML. SCIM provisioning required. Experience with Azure AD and Terraform is a plus. Node.js or C# helpful.`;

// Evidence must really be in the resume, otherwise the claim drops a level.
const reqs = checkRequirements([
  { requirement: "Okta administration", priority: "must", status: "met", evidence: "Administered Okta for 3,000 users" },
  { requirement: "SCIM provisioning", priority: "must", status: "met", evidence: "built SCIM provisioning to Workday" },
  { requirement: "Azure AD", priority: "nice", status: "met", evidence: "Managed Azure AD tenants" }, // invented
  { requirement: "Terraform", priority: "nice", status: "partial", evidence: "" },
  { requirement: "okta administration", priority: "must", status: "met", evidence: "x" }, // duplicate
  { requirement: "5+ years IAM", priority: "bogus", status: "weird" },
], resume);
assert.equal(reqs.length, 5);
assert.deepEqual(reqs.map((r) => r.status), ["met", "met", "partial", "missing", "missing"]);
assert.equal(reqs[2].downgraded, true);
assert.equal(reqs[2].evidence, "");
assert.equal(reqs[4].priority, "must");

// Keywords not in the JD are ignored; matching is whole-word and keeps tech symbols.
const kw = keywordCoverage(["Okta", "SAML", "SCIM", "Azure AD", "Terraform", "Node.js", "C#", "Kubernetes", "Ok"], jd, resume);
assert.deepEqual(kw.matched, ["Okta", "SAML", "SCIM", "Node.js", "C#"]);
assert.deepEqual(kw.missing, ["Azure AD", "Terraform"]);

// must=3, nice=1: got 3+3+0.5+0+0 = 6.5 of 11 -> 59; keywords 5/7 -> 71; 59*.75 + 71*.25 = 62
const s = computeAtsScore(reqs, kw);
assert.equal(s.breakdown.requirementScore, 59);
assert.equal(s.breakdown.keywordScore, 71);
assert.equal(s.score, 62);
assert.equal(s.verdict, "Needs Work");
assert.equal(computeAtsScore([], { matched: [], missing: [] }).score, 0);

// Study coverage keeps only real requirement strings and reports what is left.
const cov = studyCoverage([{ title: "A", requirements: ["okta administration", "Made up"] }, { title: "B" }], ["Okta administration", "SCIM provisioning"]);
assert.deepEqual(cov.modules[0].requirements, ["Okta administration"]);
assert.deepEqual(cov.modules[1].requirements, []);
assert.deepEqual(cov.uncovered, ["SCIM provisioning"]);

console.log("scoring ok");
