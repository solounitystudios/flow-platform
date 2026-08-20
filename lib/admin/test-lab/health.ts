// FLOW Test Lab — FLOW Health scoring.
//
// Deliberately simple and explicitly not a scientific measure — it's a
// flat point deduction per failing/warning result, weighted only by
// severity, computed solely from whatever results were actually run. It
// does NOT know about anything it didn't just run (typecheck/lint/build/CI
// status are separate — see the "Release Checklist" section of the
// dashboard, which is honest about not being covered by this score).
import type { FlowHealth, FlowHealthLabel, TestResult } from "./types";

const DEDUCTIONS: Record<TestResult["severity"], number> = {
  BLOCKER: 100, // any single BLOCKER FAIL zeroes the score outright
  HIGH: 25,
  MEDIUM: 10,
  LOW: 5,
  INFO: 1,
};

const WARNING_DEDUCTION = 5;

export function computeFlowHealth(results: TestResult[]): FlowHealth {
  if (results.length === 0) {
    return { score: 0, label: "RELEASE BLOCKED", explanation: "No checks have been run yet — run a suite to compute a real score." };
  }

  let score = 100;
  for (const r of results) {
    if (r.status === "FAIL") score -= DEDUCTIONS[r.severity];
    else if (r.status === "WARNING") score -= WARNING_DEDUCTION;
  }
  score = Math.max(0, Math.min(100, score));

  const hasBlockerFail = results.some((r) => r.status === "FAIL" && r.severity === "BLOCKER");
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const warningCount = results.filter((r) => r.status === "WARNING").length;

  const label: FlowHealthLabel = hasBlockerFail || score < 50 ? "RELEASE BLOCKED" : score >= 100 ? "EXCELLENT" : score >= 80 ? "GOOD" : "NEEDS ATTENTION";

  const explanation =
    `${score}/100 — 100 minus ${failCount} failing check(s) (weighted by severity: BLOCKER -100, HIGH -25, MEDIUM -10, LOW -5, INFO -1) ` +
    `and ${warningCount} warning(s) (-5 each), floored at 0. This reflects only the checks actually run in this session — ` +
    `it does not know whether typecheck/lint/build/CI passed unless those results were included.`;

  return { score, label, explanation };
}
