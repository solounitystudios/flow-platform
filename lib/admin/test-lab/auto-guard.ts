// FLOW Test Lab — Auto Guard.
//
// Phase 1 scope: config + a changed-file classifier + suite selection. This
// is intentionally NOT an autonomous process that runs itself against
// production — it's a pure function a human (or a future CI step) calls
// with a list of changed file paths and gets back a recommended suite.
// Nothing here executes tests or writes anywhere; see agents.ts/suites.ts
// for what actually runs. Rules are checked in order; a changed file can
// match more than one rule, and all matching suites are unioned.
import type { TestLabSuiteId } from "./types";

export interface AutoGuardRule {
  category: string;
  pathPatterns: RegExp[];
  suites: TestLabSuiteId[];
  rationale: string;
}

export const AUTO_GUARD_RULES: AutoGuardRule[] = [
  {
    category: "Auth / RLS / server action",
    pathPatterns: [/^supabase\/migrations\//, /^lib\/actions\.ts$/, /^lib\/admin\/auth\.ts$/, /^lib\/authz\.ts$/, /^lib\/supabase\//],
    suites: ["security"],
    rationale: "Changes here can affect who's allowed to do what — always run Security.",
  },
  {
    category: "Employer / business",
    pathPatterns: [/^app\/\(app\)\/business\//, /^components\/business\//, /^lib\/data\/organization\.ts$/],
    suites: ["employer"],
    rationale: "Organization/team surface changed — run Employer (which pulls in Security automatically, see suites.ts).",
  },
  {
    category: "Map",
    pathPatterns: [/^app\/\(app\)\/live\//, /^components\/opportunities\/LiveMap\.tsx$/, /^components\/opportunities\/LiveBrowser\.tsx$/, /^lib\/map-selectors\.ts$/, /^lib\/data\/discover\.ts$/],
    suites: ["map"],
    rationale: "Map rendering/selection logic changed — run Map (which pulls in Core Flow automatically).",
  },
  {
    category: "Passport",
    pathPatterns: [/^app\/\(app\)\/passport\//, /^lib\/data\/(profile|verifications|recommendations)\.ts$/, /^lib\/verification-actions\.ts$/],
    suites: ["security"],
    // Passport privacy is a Core Flow + privacy-regression concern; Phase 1
    // has no dedicated Passport agent yet (only 5 agents exist today per
    // this batch's scope), so this maps to the closest existing coverage
    // (Security, since privacy is fundamentally an authorization question)
    // rather than inventing an agent this batch didn't build.
    rationale: "Passport privacy is an authorization concern — run Security until a dedicated Passport agent exists.",
  },
  {
    category: "Migration",
    pathPatterns: [/^supabase\/migrations\//],
    suites: ["security", "release"],
    rationale: "Schema changes need both a security pass and, before merge, the full Release gate.",
  },
  {
    category: "UI / layout",
    pathPatterns: [/^components\/ui\//, /^app\/.*\/layout\.tsx$/, /^app\/globals\.css$/, /^tailwind\.config\.ts$/],
    suites: ["quick"],
    rationale: "Shared UI surface — run Quick Check now; mobile/accessibility checks are a future Playwright-phase hook, not built yet.",
  },
];

/** Which suites Auto Guard recommends for a given set of changed file paths (repo-relative). */
export function recommendedSuitesFor(changedFiles: string[]): TestLabSuiteId[] {
  const matched = new Set<TestLabSuiteId>();
  for (const file of changedFiles) {
    for (const rule of AUTO_GUARD_RULES) {
      if (rule.pathPatterns.some((p) => p.test(file))) {
        for (const suite of rule.suites) matched.add(suite);
      }
    }
  }
  return matched.size > 0 ? Array.from(matched) : ["quick"];
}
