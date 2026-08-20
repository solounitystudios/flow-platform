"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, AlertTriangle, MinusCircle, Play, Loader2 } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { runTestSuiteAction, type RunSuiteResult } from "@/lib/admin/test-lab/actions";
import type { FlowHealthLabel, SuiteSafety, TestLabAgentId, TestLabSuiteId, TestResult } from "@/lib/admin/test-lab/types";
import { cn } from "@/lib/utils";

const HEALTH_TONE: Record<FlowHealthLabel, "verified" | "flow" | "gold" | "urgent"> = {
  EXCELLENT: "verified",
  GOOD: "flow",
  "NEEDS ATTENTION": "gold",
  "RELEASE BLOCKED": "urgent",
};

const STATUS_META: Record<TestResult["status"], { tone: "verified" | "danger" | "gold" | "neutral"; icon: typeof CheckCircle2 }> = {
  PASS: { tone: "verified", icon: CheckCircle2 },
  FAIL: { tone: "danger", icon: XCircle },
  WARNING: { tone: "gold", icon: AlertTriangle },
  SKIPPED: { tone: "neutral", icon: MinusCircle },
};

const SEVERITY_TONE: Record<TestResult["severity"], "urgent" | "danger" | "gold" | "neutral" | "flow"> = {
  BLOCKER: "urgent",
  HIGH: "danger",
  MEDIUM: "gold",
  LOW: "neutral",
  INFO: "flow",
};

const SAFETY_LABEL: Record<SuiteSafety, string> = {
  SAFE_PRODUCTION: "Safe in production",
  STAGING_ONLY: "Staging only — not runnable here yet",
  LOCAL_ONLY: "Local only — not runnable here yet",
};

const RELEASE_CHECKLIST = [
  { label: "TypeScript typecheck", command: "npm run typecheck" },
  { label: "Lint", command: "npm run lint" },
  { label: "Automated tests", command: "npm run test" },
  { label: "Production build", command: "npm run build" },
  { label: "GitHub Actions CI (FLOW CI workflow)", command: "gh pr checks" },
];

export function TestLabDashboard({
  agents,
  suites,
}: {
  agents: { id: TestLabAgentId; name: string; description: string; safety: SuiteSafety }[];
  suites: Record<TestLabSuiteId, { label: string; description: string; agents: TestLabAgentId[] }>;
}) {
  const [pending, startTransition] = useTransition();
  const [runningSuite, setRunningSuite] = useState<TestLabSuiteId | null>(null);
  const [result, setResult] = useState<RunSuiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(suite: TestLabSuiteId) {
    setRunningSuite(suite);
    setError(null);
    startTransition(async () => {
      try {
        const next = await runTestSuiteAction(suite);
        setResult(next);
      } catch {
        setError("The run failed unexpectedly. Try again — if it keeps failing, something in the Test Lab code itself is broken, not the checks it runs.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">FLOW Health</h2>
          {result && <Badge tone={HEALTH_TONE[result.health.label]}>{result.health.label}</Badge>}
        </CardHeader>
        <CardBody className="space-y-2">
          {result ? (
            <>
              <p className="text-3xl font-bold text-ink-900 dark:text-white">{result.health.score}/100</p>
              <p className="text-xs text-ink-400">{result.health.explanation}</p>
              <p className="text-xs text-ink-400">Last run: {new Date(result.ranAt).toLocaleString()} · Suite: {suites[result.suite].label}</p>
            </>
          ) : (
            <p className="text-sm text-ink-500 dark:text-ink-400">No checks have been run yet — run a suite below to compute a real score.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Run Test</h2>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          {(Object.keys(suites) as TestLabSuiteId[]).map((id) => (
            <Button
              key={id}
              variant={id === "release" ? "primary" : "outline"}
              size="sm"
              disabled={pending}
              onClick={() => run(id)}
            >
              {pending && runningSuite === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {suites[id].label}
            </Button>
          ))}
        </CardBody>
      </Card>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">{error}</p>}

      {result && (
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">Results — {suites[result.suite].label}</h2>
            <span className="text-xs text-ink-400">{result.results.length} scenario(s)</span>
          </CardHeader>
          <CardBody className="space-y-2">
            {result.results.map((r, i) => {
              const meta = STATUS_META[r.status];
              const Icon = meta.icon;
              return (
                <div key={i} className="rounded-xl border border-ink-100 p-3 text-sm dark:border-ink-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Icon className={cn("h-4 w-4 shrink-0", meta.tone === "verified" && "text-verified-500", meta.tone === "danger" && "text-red-500", meta.tone === "gold" && "text-gold-500", meta.tone === "neutral" && "text-ink-400")} />
                    <span className="font-medium text-ink-900 dark:text-white">{r.scenario}</span>
                    <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>
                    <Badge tone={meta.tone}>{r.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {r.agent} · {r.category} · expected {r.expected}, got {r.actual}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-ink-400">{r.evidence}</p>
                  {r.status === "FAIL" && r.suggestedNextAction && (
                    <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      Next: {r.suggestedNextAction}
                    </p>
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Release Checklist</h2>
        </CardHeader>
        <CardBody className="space-y-2">
          <p className="text-xs text-ink-400">
            This dashboard can only verify what it just ran above — it cannot see whether typecheck, lint, the full
            test suite, the production build, or GitHub Actions CI actually passed. Confirm those separately before
            trusting a release; never treat a good FLOW Health score alone as proof CI passed.
          </p>
          <ul className="space-y-1.5">
            {RELEASE_CHECKLIST.map((item) => (
              <li key={item.command} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2 text-xs dark:border-ink-800">
                <span className="text-ink-700 dark:text-ink-200">{item.label}</span>
                <code className="text-ink-400">{item.command}</code>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Agents</h2>
        </CardHeader>
        <CardBody>
          {agents.length === 0 ? (
            <EmptyState title="No agents configured" />
          ) : (
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 p-3 text-sm dark:border-ink-800">
                  <div>
                    <p className="font-medium text-ink-900 dark:text-white">{a.name}</p>
                    <p className="text-xs text-ink-400">{a.description}</p>
                  </div>
                  <Badge tone={a.safety === "SAFE_PRODUCTION" ? "verified" : "neutral"}>{SAFETY_LABEL[a.safety]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
