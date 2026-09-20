import type { CaptureRequestStatus } from "@flow/passport-contracts";

/**
 * CaptureRequest lifecycle. Who drives each move:
 *   Passport/Flow:  requested (create), completed (on a valid EvidencePackage),
 *                   cancelled (the requester/subject), expired (time)
 *   Capture:        accepted, started, failed (reported over the gateway)
 * Capture can never mark a request `completed` by assertion — only delivering
 * a package that passes every check does. Mirrored in SQL
 * (`passport_capture_transition_allowed`).
 */
export const CAPTURE_TRANSITIONS: Record<CaptureRequestStatus, readonly CaptureRequestStatus[]> = {
  requested: ["accepted", "started", "completed", "failed", "cancelled", "expired"],
  accepted: ["started", "completed", "failed", "cancelled", "expired"],
  started: ["completed", "failed", "cancelled", "expired"],
  failed: [],
  completed: [],
  cancelled: [],
  expired: [],
};

/** A request that can still receive reports or a package. */
export const OPEN_CAPTURE_STATUSES: readonly CaptureRequestStatus[] = ["requested", "accepted", "started"];

export function canTransitionCapture(from: CaptureRequestStatus, to: CaptureRequestStatus): boolean {
  return CAPTURE_TRANSITIONS[from].includes(to);
}

export function effectiveCaptureStatus(request: { status: CaptureRequestStatus; expires_at: string }, now: Date): CaptureRequestStatus {
  if (OPEN_CAPTURE_STATUSES.includes(request.status) && new Date(request.expires_at).getTime() <= now.getTime()) return "expired";
  return request.status;
}

export function isCaptureOpen(request: { status: CaptureRequestStatus; expires_at: string }, now: Date): boolean {
  return OPEN_CAPTURE_STATUSES.includes(effectiveCaptureStatus(request, now));
}

/** Bounded lifetime: a capture request can't be requested to live forever. */
export const CAPTURE_DEFAULT_TTL_HOURS = 72;
export const CAPTURE_MAX_TTL_HOURS = 24 * 14;
