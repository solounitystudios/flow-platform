import type { AgentRisk, FlowAgentStatus, FlowCommandState } from "@/lib/admin/flow-command";
import type { LiveRepoStatus } from "@/lib/admin/flow-command";

type BadgeTone = "neutral" | "flow" | "verified" | "gold" | "danger" | "urgent";

/** Maps an agent's plain-language status string to a Badge tone. Falls back
 * to "neutral" for any status this dashboard doesn't yet know about, rather
 * than guessing at severity. */
export function agentStatusTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case "WORKING":
    case "REVIEWING":
      return "flow";
    case "DONE":
      return "verified";
    case "BLOCKED":
      return "danger";
    case "STOPPED":
      return "urgent";
    case "WAITING":
      return "gold";
    case "STANDBY":
    case "PLANNING":
      return "neutral";
    default:
      return "neutral";
  }
}

export function riskTone(risk: AgentRisk): BadgeTone {
  switch (risk) {
    case "LOW":
      return "neutral";
    case "MEDIUM":
      return "gold";
    case "HIGH":
      return "danger";
    case "CRITICAL":
      return "urgent";
  }
}

export function qaTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case "PASS":
      return "verified";
    case "FAIL":
      return "urgent";
    case "IN_PROGRESS":
      return "flow";
    case "NOT_STARTED":
    default:
      return "neutral";
  }
}

export function qaLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "PASS":
      return "QA: PASS";
    case "FAIL":
      return "QA: FAIL";
    case "IN_PROGRESS":
      return "QA: In progress";
    case "NOT_STARTED":
      return "QA: Not started";
    default:
      return `QA: ${status}`;
  }
}

export function usageModeTone(mode: string): BadgeTone {
  switch (mode.toUpperCase()) {
    case "GREEN":
      return "verified";
    case "YELLOW":
      return "gold";
    case "RED":
      return "urgent";
    default:
      return "neutral";
  }
}

export function qaStatusIsFail(status: string): boolean {
  return status.toUpperCase() === "FAIL";
}

// ── Alive-feeling agent status treatment ────────────────────────────────

/** The finite set of agent statuses this dashboard renders a distinct,
 * intentional visual treatment for. Anything else falls back to "OTHER"
 * rather than guessing. */
export type AgentStatusKind = "WORKING" | "REVIEWING" | "WAITING" | "BLOCKED" | "DONE" | "STANDBY" | "STOPPED" | "OTHER";

export function normalizeAgentStatus(status: string): AgentStatusKind {
  const s = status.toUpperCase();
  if (s === "WORKING" || s === "REVIEWING" || s === "WAITING" || s === "BLOCKED" || s === "DONE" || s === "STANDBY" || s === "STOPPED") {
    return s;
  }
  return "OTHER";
}

/** An agent counts as "active right now" — i.e. actually doing something or
 * needing attention — for the ACTIVE NOW section and the agent relay. */
export function isAgentActiveNow(status: string): boolean {
  const kind = normalizeAgentStatus(status);
  return kind === "WORKING" || kind === "REVIEWING" || kind === "BLOCKED";
}

export interface AgentStatusVisual {
  /** Border/background treatment for the agent's card or chip. */
  cardClass: string;
  /** Small status dot/indicator color. */
  dotClass: string;
  /** Optional motion-safe-only animation class — always paired with a static
   * fallback via motion-safe:, never left animating for reduced-motion users. */
  animationClass: string;
  /** Short plain-English label, distinct from the raw status string. */
  label: string;
}

const AGENT_STATUS_VISUALS: Record<AgentStatusKind, AgentStatusVisual> = {
  WORKING: {
    cardClass: "border-flow-300 bg-flow-50/70 dark:border-flow-700 dark:bg-flow-950/40",
    dotClass: "bg-flow-500",
    animationClass: "motion-safe:animate-pulse-slow",
    label: "Working",
  },
  REVIEWING: {
    cardClass: "border-flow-200 bg-flow-50/40 dark:border-flow-800 dark:bg-flow-950/25",
    dotClass: "bg-flow-400",
    animationClass: "motion-safe:animate-pulse-slow",
    label: "Reviewing",
  },
  BLOCKED: {
    cardClass: "border-red-300 bg-red-50/70 dark:border-red-800 dark:bg-red-950/30",
    dotClass: "bg-red-500",
    animationClass: "",
    label: "Blocked",
  },
  DONE: {
    cardClass: "border-verified-500/30 bg-verified-500/5 dark:border-verified-500/20",
    dotClass: "bg-verified-500",
    animationClass: "",
    label: "Done",
  },
  WAITING: {
    cardClass: "border-gold-500/30 bg-gold-500/5 dark:border-gold-500/20",
    dotClass: "bg-gold-500",
    animationClass: "",
    label: "Waiting",
  },
  STANDBY: {
    cardClass: "border-dashed border-ink-200 bg-ink-50/60 dark:border-ink-700 dark:bg-ink-950/30",
    dotClass: "bg-ink-300 dark:bg-ink-600",
    animationClass: "",
    label: "Standing by",
  },
  STOPPED: {
    cardClass: "border-red-200 bg-ink-50 dark:border-red-900/50 dark:bg-ink-950",
    dotClass: "bg-red-400",
    animationClass: "",
    label: "Stopped",
  },
  OTHER: {
    cardClass: "border-ink-100 dark:border-ink-800",
    dotClass: "bg-ink-300 dark:bg-ink-600",
    animationClass: "",
    label: "Unknown",
  },
};

export function agentStatusVisual(status: string): AgentStatusVisual {
  return AGENT_STATUS_VISUALS[normalizeAgentStatus(status)];
}

/** Selects whichever agents are actually active right now, preserving the
 * order they appear in state.agents — never inventing an order. */
export function getActiveAgents(agents: FlowAgentStatus[]): FlowAgentStatus[] {
  return agents.filter((a) => isAgentActiveNow(a.status));
}

// ── Founder approval state ──────────────────────────────────────────────

export function founderApprovalTone(required: boolean): BadgeTone {
  return required ? "urgent" : "verified";
}

export function founderApprovalLabel(required: boolean): string {
  return required ? "FOUNDER APPROVAL REQUIRED" : "NO APPROVAL NEEDED";
}

// ── Feed-entry emphasis (styling only, no new data) ─────────────────────

export type FeedEmphasis = "delegation" | "checkpoint" | "qa" | "blocker" | "approval" | "complete" | "none";

const FEED_KEYWORDS: { emphasis: FeedEmphasis; patterns: RegExp[] }[] = [
  { emphasis: "complete", patterns: [/mission complete/i, /flow mission complete/i] },
  { emphasis: "blocker", patterns: [/blocker/i, /blocked/i, /stopped/i] },
  { emphasis: "qa", patterns: [/\bqa\b/i, /quality assurance/i, /qa-security/i] },
  { emphasis: "approval", patterns: [/founder/i, /approv/i] },
  { emphasis: "checkpoint", patterns: [/checkpoint/i] },
  { emphasis: "delegation", patterns: [/handed|delegat|assign/i] },
];

/** Pure, honest styling hook: looks at the real feed message text for
 * keywords and returns a category for visual emphasis only. Never adds or
 * infers a claim beyond what the message already says. */
export function classifyFeedEntry(message: string): FeedEmphasis {
  for (const { emphasis, patterns } of FEED_KEYWORDS) {
    if (patterns.some((p) => p.test(message))) return emphasis;
  }
  return "none";
}

export function feedEmphasisClass(emphasis: FeedEmphasis): string {
  switch (emphasis) {
    case "complete":
      return "border-verified-500 bg-verified-500/5";
    case "blocker":
      return "border-red-500 bg-red-500/5";
    case "qa":
      return "border-flow-400 bg-flow-500/5";
    case "approval":
      return "border-gold-500 bg-gold-500/5";
    case "checkpoint":
      return "border-flow-300";
    case "delegation":
      return "border-ink-300 dark:border-ink-700";
    default:
      return "border-ink-100 dark:border-ink-800";
  }
}

// ── Stale-status detection (checkpoint-based, not live-polling) ─────────

/**
 * Pure heuristic over already-available data (parsed JSON state + live git
 * status) — flags when the recorded status plausibly no longer reflects
 * reality, without claiming any live telemetry. Used only to decide whether
 * to surface a caution note; the timestamp itself is always shown regardless.
 */
export function detectPossibleStale(state: FlowCommandState, liveRepo: LiveRepoStatus): boolean {
  const hasActiveAgent = state.agents.some((a) => isAgentActiveNow(a.status));
  const allCheckpointsDone = state.checkpoints.length > 0 && state.checkpoints.every((c) => c.status === "done");
  const treeCleanLive = liveRepo.available && liveRepo.workingTreeClean === true;

  if (hasActiveAgent && allCheckpointsDone) return true;
  if (hasActiveAgent && treeCleanLive) return true;
  return false;
}
