import type { AgentRisk } from "@/lib/admin/flow-command";

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
