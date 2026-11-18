// A made-up job with finished results on every tab, shown during the product tour.
// It is saved as a normal job flagged `demo: true` (so the job page can load it), never sent to the AI,
// and deleted when the tour ends.

const requirements = [
  "3+ years in an operations or business analyst role",
  "Advanced SQL for reporting and ad hoc analysis",
  "Building dashboards in Tableau or Power BI",
  "Process mapping and improvement",
  "Presenting findings to non-technical stakeholders",
];
const niceToHave = ["Python for data cleaning", "Experience in logistics or supply chain"];

const description = `Northwind Freight is hiring an Operations Analyst to help our regional teams run on data.

What you will do:
- Own weekly reporting on on-time delivery, cost per shipment and warehouse throughput
- Write SQL against our data warehouse to answer questions from operations leaders
- Build and maintain Tableau dashboards used by 40+ site managers
- Map current processes, find bottlenecks and lead small improvement projects
- Present findings and recommendations to non-technical stakeholders

What you bring:
- 3+ years in an operations or business analyst role
- Advanced SQL (joins, window functions, CTEs)
- Experience building dashboards in Tableau or Power BI
- Process mapping and improvement experience
- Clear written and spoken communication

Nice to have:
- Python (pandas) for data cleaning
- Experience in logistics or supply chain

This is a sample job used in the Jobaton tour.`;

const lessonSections = [
  { heading: "Why window functions matter here", body: "Operations reporting is full of 'compared with last week' and 'running total' questions. Window functions answer them in one query without self-joins, which keeps weekly reports fast and readable." },
  { heading: "The pattern to know", body: "Use LAG() to compare a week with the one before it, and SUM() OVER (PARTITION BY site ORDER BY week) for running totals per site.", codeSnippet: "SELECT site, week, on_time_pct,\n       on_time_pct - LAG(on_time_pct) OVER (PARTITION BY site ORDER BY week) AS change\nFROM weekly_delivery;" },
  { heading: "How to talk about it in the interview", body: "Describe a report you automated, the question it answered and the time it saved. Interviewers care more about the decision your query supported than the syntax." },
];

const lessons = (moduleTitle: string, withContent: boolean) => [
  { title: "Core Concepts", type: "read", duration: "20 min", description: `Core Concepts for ${moduleTitle}`, completed: false,
    ...(withContent ? { sections: lessonSections, keyPoints: ["LAG() compares a row with the previous one", "PARTITION BY keeps each site separate", "Tie every query to the decision it supported"], quiz: [] } : {}) },
  { title: "Scenario Practice", type: "practice", duration: "15 min", description: `Scenario Practice for ${moduleTitle}`, completed: false },
  { title: "Knowledge Check", type: "quiz", duration: "10 min", description: `Knowledge Check for ${moduleTitle}`, completed: false },
];

const modules = [
  { title: "Advanced SQL for operations reporting", description: "Prepares you to write the weekly delivery and cost queries this team runs, and to explain them in the technical interview.", requirements: [requirements[1], niceToHave[0]] },
  { title: "Tableau dashboards for site managers", description: "Design a dashboard a busy site manager can read in 30 seconds.", requirements: [requirements[2]] },
  { title: "Process mapping and bottleneck analysis", description: "Map a shipment's journey, find where time is lost and size the fix.", requirements: [requirements[3], niceToHave[1]] },
  { title: "Presenting data to non-technical leaders", description: "Turn an analysis into a one-slide recommendation.", requirements: [requirements[4], requirements[0]] },
];

export const DEMO_JOB = {
  demo: true,
  title: "Operations Analyst (sample)",
  company: "Northwind Freight",
  location: "Remote",
  salary: "$75k - $90k",
  status: "saved",
  raw_description: description,
  description_summary: "Analyst role turning delivery, cost and warehouse data into weekly reports, dashboards and process improvements for regional operations teams.",
  requirements,
  nice_to_have: niceToHave,
  prep_data: {
    ats: {
      method: 2,
      score: 68,
      verdict: "Good Match",
      summary: "Sample result. Strong SQL and stakeholder reporting; dashboard tool experience is only partly shown and there is no logistics background.",
      requirements: [
        { requirement: requirements[0], priority: "must", status: "met", evidence: "Business Analyst at Contoso Retail, 2021 to present", downgraded: false },
        { requirement: requirements[1], priority: "must", status: "met", evidence: "wrote SQL with window functions for weekly sales reporting", downgraded: false },
        { requirement: requirements[2], priority: "must", status: "partial", evidence: "built Excel dashboards for regional managers", downgraded: false },
        { requirement: requirements[3], priority: "must", status: "partial", evidence: "", downgraded: true },
        { requirement: requirements[4], priority: "must", status: "met", evidence: "presented monthly results to the leadership team", downgraded: false },
        { requirement: niceToHave[0], priority: "nice", status: "missing", evidence: "", downgraded: false },
        { requirement: niceToHave[1], priority: "nice", status: "missing", evidence: "", downgraded: false },
      ],
      breakdown: { requirementScore: 71, keywordScore: 60, requirementWeight: 75, keywordWeight: 25, mustMet: 3, mustPartial: 2, mustTotal: 5, keywordsMatched: 6, keywordsTotal: 10 },
      keywordMatches: ["SQL", "window functions", "CTEs", "reporting", "dashboards", "stakeholders"],
      missingKeywords: ["Tableau", "Power BI", "process mapping", "pandas"],
      strengths: ["Several years of analyst work with SQL", "Regular reporting to leadership"],
      skillGaps: [{ skill: "Tableau", importance: "critical", suggestion: "Build one public Tableau dashboard from a sample logistics dataset." }],
      suggestions: ["Name the dashboard tool you used and who read the dashboards.", "Add one process you improved and the time or cost it saved."],
      redFlags: [],
      sections: {},
    },
    cover_letter: `Dear Hiring Team at Northwind Freight,

I am applying for the Operations Analyst role. For the past three years I have turned sales and inventory data into weekly reports that regional managers use to make decisions, which is close to what your team does with delivery and warehouse data.

My day-to-day work is SQL: window functions for week-over-week comparisons, CTEs to keep long queries readable, and checks so the numbers can be trusted. I also present the results to leadership every month, so I am used to explaining what the data means rather than how it was produced.

I have not worked in logistics yet, and I would bring the same habit I use now: learn the process first, then measure it.

Thank you for your time. I would welcome the chance to talk.

(This is a sample letter. Yours is written from your own resume.)`,
    study_guide: {
      title: "Study Guide for Operations Analyst",
      modules,
      coverage: { total: requirements.length + niceToHave.length, covered: [...requirements, ...niceToHave], uncovered: [] },
      training: modules.map((m, i) => ({ skill: m.title, title: m.title, description: m.description, requirements: m.requirements, lessons: lessons(m.title, i === 0) })),
    },
    interview: {
      stages: {
        recruiter: {
          overview: "Sample recruiter screen: motivation, background and logistics.",
          tips: ["Have a two-minute summary of your background ready.", "Know your salary range before the call."],
          rounds: [{
            name: "Recruiter screen",
            questions: [
              { question: "Why are you interested in operations analytics at a freight company?", difficulty: "easy", explanation: "Link your reporting experience to their delivery and cost questions.",
                options: [{ label: "Connect my reporting work to their delivery and cost decisions", correct: true }, { label: "Say I want any analyst job", correct: false }, { label: "Talk only about salary", correct: false }, { label: "Describe a hobby", correct: false }] },
              { question: "Walk me through a report you built that changed a decision.", difficulty: "medium", explanation: "Name the question, the data, the result and the decision.",
                options: [{ label: "The question, the data, the result and the decision it changed", correct: true }, { label: "List every tool I know", correct: false }, { label: "Say reports rarely matter", correct: false }, { label: "Describe the report layout only", correct: false }] },
            ],
          }],
        },
      },
    },
  },
};

export const isDemoJob = (job: any) => job?.demo === true;
