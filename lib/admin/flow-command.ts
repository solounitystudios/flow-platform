import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CheckpointStatus } from "@/components/ui/CheckpointTrail";

const execFileAsync = promisify(execFile);

// ── Shared types ────────────────────────────────────────────────────────

export type AgentRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type QaStatus = "NOT_STARTED" | "IN_PROGRESS" | "PASS" | "FAIL";
export type UsageMode = "GREEN" | "YELLOW" | "RED";

export interface FlowCheckpoint {
  name: string;
  status: CheckpointStatus;
  note?: string;
}

export interface FlowAgentStatus {
  name: string;
  role: string;
  status: string;
  current_task: string | null;
  last_action: string | null;
  next_action: string | null;
  files_owned: string[];
  files_touched: string[];
  risk: AgentRisk;
  schema_impact: boolean;
  waiting_on: string | null;
}

export interface FlowFeedEntry {
  time: string;
  actor: string;
  message: string;
}

export interface FlowSchemaImpact {
  changed: boolean;
  notes?: string;
}

export interface FlowRepoStatusReported {
  branch: string | null;
  working_tree: string | null;
  ahead_of_origin: number | null;
  last_commit: string | null;
}

export interface FlowLastCompletedMission {
  name: string;
  commit?: string | null;
  summary?: string | null;
  agents_used?: string[];
  migration?: string | null;
  qa_status?: string | null;
  lint_status?: string | null;
  typecheck_status?: string | null;
  build_status?: string | null;
  production_touched?: boolean | null;
  pushed?: boolean | null;
}

export interface FlowCommandState {
  mission: string;
  phase: string;
  phases: string[];
  checkpoints: FlowCheckpoint[];
  agents: FlowAgentStatus[];
  feed: FlowFeedEntry[];
  files_touched: string[];
  schema_impact: FlowSchemaImpact | null;
  qa_status: QaStatus | string;
  repo_status: FlowRepoStatusReported | null;
  production_touched: boolean | null;
  blockers: string[];
  founder_approval_required: boolean;
  usage_mode: UsageMode | string;
  usage_mode_note: string | null;
  active_agent_count: number | null;
  parallelism_limited: boolean | null;
  last_completed_mission: FlowLastCompletedMission | null;
  updated_at: string | null;
}

export type FlowCommandStateResult =
  | { ok: true; state: FlowCommandState }
  | { ok: false; reason: "missing" | "malformed"; detail?: string };

// ── JSON state file ─────────────────────────────────────────────────────

const STATE_FILE_PATH = path.join(process.cwd(), ".claude", "flow-command-state.json");

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function coerceCheckpoints(v: unknown): FlowCheckpoint[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "Untitled checkpoint",
      status: c.status === "done" || c.status === "in_progress" || c.status === "pending" ? c.status : "pending",
      note: typeof c.note === "string" ? c.note : undefined,
    }));
}

function coerceAgents(v: unknown): FlowAgentStatus[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null && typeof a.name === "string")
    .map((a) => ({
      name: a.name as string,
      role: typeof a.role === "string" ? a.role : "",
      status: typeof a.status === "string" ? a.status : "UNKNOWN",
      current_task: typeof a.current_task === "string" ? a.current_task : null,
      last_action: typeof a.last_action === "string" ? a.last_action : null,
      next_action: typeof a.next_action === "string" ? a.next_action : null,
      files_owned: isStringArray(a.files_owned) ? a.files_owned : [],
      files_touched: isStringArray(a.files_touched) ? a.files_touched : [],
      risk: a.risk === "LOW" || a.risk === "MEDIUM" || a.risk === "HIGH" || a.risk === "CRITICAL" ? a.risk : "LOW",
      schema_impact: a.schema_impact === true,
      waiting_on: typeof a.waiting_on === "string" ? a.waiting_on : null,
    }));
}

function coerceFeed(v: unknown): FlowFeedEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => ({
      time: typeof f.time === "string" ? f.time : "",
      actor: typeof f.actor === "string" ? f.actor : "unknown",
      message: typeof f.message === "string" ? f.message : "",
    }))
    .filter((f) => f.time && f.message);
}

function coerceSchemaImpact(v: unknown): FlowSchemaImpact | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  return {
    changed: obj.changed === true,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
  };
}

function coerceRepoStatus(v: unknown): FlowRepoStatusReported | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  return {
    branch: typeof obj.branch === "string" ? obj.branch : null,
    working_tree: typeof obj.working_tree === "string" ? obj.working_tree : null,
    ahead_of_origin: typeof obj.ahead_of_origin === "number" ? obj.ahead_of_origin : null,
    last_commit: typeof obj.last_commit === "string" ? obj.last_commit : null,
  };
}

function coerceLastCompletedMission(v: unknown): FlowLastCompletedMission | null {
  if (typeof v !== "object" || v === null) return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.name !== "string") return null;
  return {
    name: obj.name,
    commit: typeof obj.commit === "string" ? obj.commit : null,
    summary: typeof obj.summary === "string" ? obj.summary : null,
    agents_used: isStringArray(obj.agents_used) ? obj.agents_used : [],
    migration: typeof obj.migration === "string" ? obj.migration : null,
    qa_status: typeof obj.qa_status === "string" ? obj.qa_status : null,
    lint_status: typeof obj.lint_status === "string" ? obj.lint_status : null,
    typecheck_status: typeof obj.typecheck_status === "string" ? obj.typecheck_status : null,
    build_status: typeof obj.build_status === "string" ? obj.build_status : null,
    production_touched: typeof obj.production_touched === "boolean" ? obj.production_touched : null,
    pushed: typeof obj.pushed === "boolean" ? obj.pushed : null,
  };
}

/**
 * Reads and defensively validates .claude/flow-command-state.json fresh on
 * every call — never cached across requests, since flow-lead updates this
 * file out-of-band from this app's own process. Missing or malformed input
 * returns a typed "no mission tracked" result rather than throwing, so the
 * page always has a safe empty state to render.
 */
export async function getFlowCommandState(): Promise<FlowCommandStateResult> {
  let raw: string;
  try {
    raw = await fs.readFile(STATE_FILE_PATH, "utf-8");
  } catch {
    return { ok: false, reason: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: "malformed", detail: err instanceof Error ? err.message : "Invalid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "malformed", detail: "Top-level value is not an object." };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.mission !== "string") {
    return { ok: false, reason: "malformed", detail: "Missing 'mission' field." };
  }

  const qaStatus = typeof obj.qa_status === "string" ? obj.qa_status : "NOT_STARTED";
  const usageMode = typeof obj.usage_mode === "string" ? obj.usage_mode : "GREEN";

  const state: FlowCommandState = {
    mission: obj.mission,
    phase: typeof obj.phase === "string" ? obj.phase : "unknown",
    phases: isStringArray(obj.phases) ? obj.phases : [],
    checkpoints: coerceCheckpoints(obj.checkpoints),
    agents: coerceAgents(obj.agents),
    feed: coerceFeed(obj.feed),
    files_touched: isStringArray(obj.files_touched) ? obj.files_touched : [],
    schema_impact: coerceSchemaImpact(obj.schema_impact),
    qa_status: qaStatus,
    repo_status: coerceRepoStatus(obj.repo_status),
    production_touched: typeof obj.production_touched === "boolean" ? obj.production_touched : null,
    blockers: isStringArray(obj.blockers) ? obj.blockers : [],
    founder_approval_required: obj.founder_approval_required === true,
    usage_mode: usageMode,
    usage_mode_note: typeof obj.usage_mode_note === "string" ? obj.usage_mode_note : null,
    active_agent_count: typeof obj.active_agent_count === "number" ? obj.active_agent_count : null,
    parallelism_limited: typeof obj.parallelism_limited === "boolean" ? obj.parallelism_limited : null,
    last_completed_mission: coerceLastCompletedMission(obj.last_completed_mission),
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : null,
  };

  return { ok: true, state };
}

// ── Live git status ──────────────────────────────────────────────────────

export interface LiveRepoStatus {
  available: boolean;
  branch: string | null;
  workingTreeClean: boolean | null;
  changedFileCount: number | null;
  lastCommit: string | null;
  aheadOfOrigin: number | null;
  behindOrigin: number | null;
  hasUpstream: boolean;
}

const REPO_ROOT = process.cwd();

async function runGit(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT, timeout: 10_000 });
  return stdout.trim();
}

/**
 * Shells out to read-only git commands with fixed argument arrays (never
 * shell-interpolated) to report the repo's actual current state, independent
 * of whatever the JSON status file happens to say. Returns available:false
 * rather than throwing if git or .git isn't present (e.g. a production
 * deploy without repo history).
 */
export async function getLiveRepoStatus(): Promise<LiveRepoStatus> {
  const unavailable: LiveRepoStatus = {
    available: false,
    branch: null,
    workingTreeClean: null,
    changedFileCount: null,
    lastCommit: null,
    aheadOfOrigin: null,
    behindOrigin: null,
    hasUpstream: false,
  };

  let branch: string;
  try {
    branch = await runGit(["branch", "--show-current"]);
    if (!branch) return unavailable;
  } catch {
    return unavailable;
  }

  let porcelain = "";
  let lastCommit: string | null = null;
  try {
    porcelain = await runGit(["status", "--porcelain"]);
  } catch {
    // leave as empty; still report what we can
  }
  try {
    lastCommit = await runGit(["log", "-1", "--oneline"]);
  } catch {
    lastCommit = null;
  }

  const changedFileCount = porcelain ? porcelain.split("\n").filter(Boolean).length : 0;

  let hasUpstream = false;
  let aheadOfOrigin: number | null = null;
  let behindOrigin: number | null = null;
  try {
    await runGit(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]);
    hasUpstream = true;
  } catch {
    hasUpstream = false;
  }

  if (hasUpstream) {
    try {
      const counts = await runGit(["rev-list", "--left-right", "--count", `origin/${branch}...HEAD`]);
      const [behind, ahead] = counts.split(/\s+/).map((n) => Number.parseInt(n, 10));
      behindOrigin = Number.isFinite(behind) ? behind : null;
      aheadOfOrigin = Number.isFinite(ahead) ? ahead : null;
    } catch {
      aheadOfOrigin = null;
      behindOrigin = null;
    }
  }

  return {
    available: true,
    branch,
    workingTreeClean: changedFileCount === 0,
    changedFileCount,
    lastCommit,
    aheadOfOrigin,
    behindOrigin,
    hasUpstream,
  };
}

// ── Risk / rogue-agent derivation ───────────────────────────────────────

/** From FLOW_ORCHESTRATION.md's "Files everyone shares" section — a stable
 * repo convention, hardcoded here rather than parsed from the doc. */
export const SHARED_FILES = [
  "lib/database.types.ts",
  "lib/types.ts",
  "lib/actions.ts",
  "lib/admin/auth.ts",
  "lib/demo.ts",
  "lib/utils.ts",
  "components/ui/",
  "app/layout.tsx",
  "proxy.ts",
  "package.json",
  "tailwind.config.ts",
  "CLAUDE.md",
  "AGENTS.md",
] as const;

export interface FlowRiskFlag {
  severity: AgentRisk;
  agent: string | null;
  what: string;
  filesAffected: string[];
  recommendedAction: string;
}

function touchesSharedFile(file: string): boolean {
  return SHARED_FILES.some((shared) => (shared.endsWith("/") ? file.startsWith(shared) : file === shared));
}

/**
 * Pure derivation over already-parsed state — no new data, no fabricated
 * telemetry. Flags: HIGH/CRITICAL agent risk, QA FAIL, open blockers,
 * a schema change in this batch, or an agent touching a shared file that
 * FLOW_ORCHESTRATION.md says needs serialized, coordinated edits.
 */
export function deriveRiskFlags(state: FlowCommandState): FlowRiskFlag[] {
  const flags: FlowRiskFlag[] = [];

  for (const agent of state.agents) {
    if (agent.risk === "HIGH" || agent.risk === "CRITICAL") {
      flags.push({
        severity: agent.risk,
        agent: agent.name,
        what: `${agent.name} is flagged ${agent.risk} risk${agent.current_task ? `: ${agent.current_task}` : "."}`,
        filesAffected: agent.files_touched,
        recommendedAction: "Review this agent's changes before continuing — do not let it proceed unattended.",
      });
    }

    const sharedTouched = agent.files_touched.filter(touchesSharedFile);
    if (sharedTouched.length > 0) {
      flags.push({
        severity: "MEDIUM",
        agent: agent.name,
        what: `${agent.name} touched one or more files shared across every agent's work.`,
        filesAffected: sharedTouched,
        recommendedAction: "Confirm no other agent is mid-edit on the same shared file before merging or continuing.",
      });
    }
  }

  if (state.qa_status === "FAIL") {
    flags.push({
      severity: "HIGH",
      agent: "qa-security",
      what: "QA reported FAIL on the current batch.",
      filesAffected: [],
      recommendedAction: "Send the batch back to the relevant specialist — do not release until QA passes.",
    });
  }

  if (state.blockers.length > 0) {
    flags.push({
      severity: "MEDIUM",
      agent: null,
      what: `${state.blockers.length} open blocker${state.blockers.length === 1 ? "" : "s"}: ${state.blockers.join("; ")}`,
      filesAffected: [],
      recommendedAction: "Resolve the blocker before advancing this mission further.",
    });
  }

  if (state.schema_impact?.changed) {
    flags.push({
      severity: "MEDIUM",
      agent: "supabase-backend",
      what: `This batch includes a schema change${state.schema_impact.notes ? `: ${state.schema_impact.notes}` : "."}`,
      filesAffected: [],
      recommendedAction: "Confirm the migration is additive and reviewed before it ships to production.",
    });
  }

  return flags;
}
