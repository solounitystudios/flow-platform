"use server";

import { requireSecureAdmin } from "@/lib/admin/auth";
import { getAgent } from "./agents";
import { TEST_LAB_SUITES } from "./suites";
import { computeFlowHealth } from "./health";
import type { FlowHealth, TestLabSuiteId, TestResult } from "./types";

export interface RunSuiteResult {
  suite: TestLabSuiteId;
  results: TestResult[];
  health: FlowHealth;
  ranAt: string;
}

/**
 * AAL2-gated (requireSecureAdmin, same convention as every other secure
 * admin Server Action in this repo). Runs the requested suite's agents
 * in-process — no shell-out, no child process, no database write. Safe to
 * call from production: every Phase 1 agent is SuiteSafety.SAFE_PRODUCTION
 * pure computation (see agents.ts).
 */
export async function runTestSuiteAction(suite: TestLabSuiteId): Promise<RunSuiteResult> {
  await requireSecureAdmin();

  const definition = TEST_LAB_SUITES[suite];
  const results = definition.agents.flatMap((agentId) => getAgent(agentId).run());

  return {
    suite,
    results,
    health: computeFlowHealth(results),
    ranAt: new Date().toISOString(),
  };
}
