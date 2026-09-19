import type { ConnectionErrorCategory, ConnectionStatus, IntegrationConnection } from "@flow/passport-contracts";

/**
 * What a reader should believe about a connection right now. A stored
 * `healthy` connection that hasn't succeeded within its staleness window
 * reads as `stale` — silence is information, not health.
 */
export function effectiveConnectionStatus(
  connection: Pick<IntegrationConnection, "status" | "last_success_at" | "stale_after_seconds">,
  now: Date,
): ConnectionStatus {
  if (connection.status !== "healthy") return connection.status;
  if (!connection.last_success_at) return "stale";
  const ageSeconds = (now.getTime() - new Date(connection.last_success_at).getTime()) / 1000;
  return ageSeconds > connection.stale_after_seconds ? "stale" : "healthy";
}

/** Maps a failed sync's category to the connection status it should cause. */
export function statusForFailure(category: ConnectionErrorCategory): ConnectionStatus {
  switch (category) {
    case "auth":
      return "auth_required";
    case "network":
    case "source_unavailable":
    case "rate_limit":
      return "degraded";
    case "schema":
    case "rejected":
    case "unknown":
      return "error";
  }
}

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  healthy: "Connected",
  stale: "No recent activity",
  degraded: "Degraded",
  disconnected: "Disconnected",
  auth_required: "Re-authorization needed",
  error: "Error",
};
