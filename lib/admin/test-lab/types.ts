// FLOW Test Lab — Phase 1 shared types.
//
// Phase 1 scope (deliberately not the full synthetic-city/digital-twin
// system): a deterministic, in-process test runner exposed behind an
// agent-style interface. Every "agent" below is real code executing real
// assertions against the same pure, dependency-free predicate/selector
// functions this repo's Vitest suite already covers (lib/authz.ts,
// lib/map-selectors.ts, lib/redirect-safety.ts) — not a simulated or
// hard-coded result, and not an autonomous LLM process (see agents.ts's
// header for why that distinction matters here).

export type TestStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED";
export type TestSeverity = "BLOCKER" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

/**
 * SAFE_PRODUCTION: pure in-memory computation, zero I/O, safe to run
 * against the live app at any time — everything in Phase 1 is this tier.
 * STAGING_ONLY: needs a real (non-production) Supabase project — nothing
 * in Phase 1 runs this way yet (see tests/integration/'s it.todo suite).
 * LOCAL_ONLY: needs a local dev environment (e.g. a future Playwright
 * suite against `next dev`) — not yet implemented either.
 * The Test Lab must never execute a STAGING_ONLY or LOCAL_ONLY suite
 * against production data — Phase 1 simply doesn't define any yet.
 */
export type SuiteSafety = "SAFE_PRODUCTION" | "STAGING_ONLY" | "LOCAL_ONLY";

export interface TestResult {
  scenario: string;
  agent: string;
  category: string;
  severity: TestSeverity;
  expected: string;
  actual: string;
  status: TestStatus;
  evidence: string;
  suggestedNextAction: string | null;
}

export type TestLabAgentId = "core-flow" | "security" | "employer" | "map" | "regression";

export interface TestLabAgent {
  id: TestLabAgentId;
  name: string;
  description: string;
  safety: SuiteSafety;
  run: () => TestResult[];
}

export type TestLabSuiteId = "quick" | "security" | "employer" | "map" | "release";

export type FlowHealthLabel = "EXCELLENT" | "GOOD" | "NEEDS ATTENTION" | "RELEASE BLOCKED";

export interface FlowHealth {
  score: number;
  label: FlowHealthLabel;
  explanation: string;
}
