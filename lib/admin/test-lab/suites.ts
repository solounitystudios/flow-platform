// FLOW Test Lab — Phase 1 suite definitions.
//
// A "suite" is just a named set of agents to run together — this is the
// same grouping the Auto Guard changed-file classifier recommends (see
// auto-guard.ts), exposed directly as the dashboard's launcher buttons so
// there is one mapping, not two that could drift apart.
import type { TestLabAgentId, TestLabSuiteId } from "./types";

export const TEST_LAB_SUITES: Record<TestLabSuiteId, { label: string; description: string; agents: TestLabAgentId[] }> = {
  quick: {
    label: "Quick Check",
    description: "Fastest sanity pass — Core Flow only.",
    agents: ["core-flow"],
  },
  security: {
    label: "Security",
    description: "FLOW-SEC-001 and open-redirect authorization regressions.",
    agents: ["security"],
  },
  employer: {
    label: "Employer",
    description: "Organization/team access, plus its Security dependency.",
    agents: ["employer", "security"],
  },
  map: {
    label: "Map",
    description: "Map location-safety, plus Core Flow.",
    agents: ["map", "core-flow"],
  },
  release: {
    label: "Release",
    description: "Everything Phase 1 can check — the minimum gate before a merge.",
    agents: ["core-flow", "security", "employer", "map", "regression"],
  },
};
