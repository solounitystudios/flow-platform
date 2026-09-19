import { SENSITIVE_DATA_CATEGORIES, type ConsentPurpose, type ConsentStatus, type DataCategory } from "@flow/passport-contracts";

/**
 * Consent lifecycle: REQUEST -> APPROVE/DECLINE -> ACTIVE -> EXPIRE/REVOKE.
 * Mirrored in SQL (`passport_consent_transition_allowed`) and kept in
 * lockstep by tests/unit/passport-sql-parity.test.ts.
 */
export const CONSENT_TRANSITIONS: Record<ConsentStatus, readonly ConsentStatus[]> = {
  requested: ["active", "declined", "withdrawn", "expired"],
  active: ["revoked", "expired"],
  declined: [],
  revoked: [],
  expired: [],
  withdrawn: [],
};

export function canTransitionConsent(from: ConsentStatus, to: ConsentStatus): boolean {
  return CONSENT_TRANSITIONS[from].includes(to);
}

export const CONSENT_REQUEST_TTL_DAYS = 14;
export const CONSENT_DEFAULT_GRANT_DAYS = 90;
export const CONSENT_MAX_GRANT_DAYS = 365;

/**
 * Purpose-bound minimisation: a purpose may only ever ask for the categories
 * that make sense for it. A hiring review can never ask for `location`; an
 * event-entry check can never ask for `work_history`. Mirrored in SQL
 * (`passport_purpose_allows_category`).
 */
export const PURPOSE_ALLOWED_CATEGORIES: Record<ConsentPurpose, readonly DataCategory[]> = {
  hiring_review: ["credentials", "skills", "work_history", "reliability", "recommendations", "attendance", "contact", "evidence_artifacts"],
  credential_check: ["credentials"],
  event_entry: ["credentials", "identity_attributes", "attendance"],
  program_enrollment: ["credentials", "skills", "attendance", "identity_attributes", "contact"],
  capture_request: ["evidence_artifacts", "location"],
  mentorship: ["skills", "credentials", "recommendations"],
};

export type ConsentRequestProblem = "no_categories" | "category_not_allowed_for_purpose" | "duplicate_category";

export function validateConsentRequest(purpose: ConsentPurpose, categories: readonly DataCategory[]): { ok: true } | { ok: false; problem: ConsentRequestProblem } {
  if (categories.length === 0) return { ok: false, problem: "no_categories" };
  if (new Set(categories).size !== categories.length) return { ok: false, problem: "duplicate_category" };
  const allowed = PURPOSE_ALLOWED_CATEGORIES[purpose];
  if (categories.some((category) => !allowed.includes(category))) return { ok: false, problem: "category_not_allowed_for_purpose" };
  return { ok: true };
}

export type ConsentApprovalProblem = "nothing_approved" | "approved_exceeds_request" | "expiry_not_in_future" | "expiry_too_far";

/**
 * Approving may narrow a request but never widen it, and every approval is
 * time-limited. The grantor chooses the expiry; there is no open-ended grant.
 */
export function validateConsentApproval(input: {
  requested: readonly DataCategory[];
  approved: readonly DataCategory[];
  expiresAt: Date;
  now: Date;
}): { ok: true } | { ok: false; problem: ConsentApprovalProblem } {
  if (input.approved.length === 0) return { ok: false, problem: "nothing_approved" };
  if (input.approved.some((category) => !input.requested.includes(category))) return { ok: false, problem: "approved_exceeds_request" };
  if (input.expiresAt.getTime() <= input.now.getTime()) return { ok: false, problem: "expiry_not_in_future" };
  const maxMs = CONSENT_MAX_GRANT_DAYS * 24 * 60 * 60 * 1000;
  if (input.expiresAt.getTime() - input.now.getTime() > maxMs) return { ok: false, problem: "expiry_too_far" };
  return { ok: true };
}

export function effectiveConsentStatus(grant: { status: ConsentStatus; expires_at: string | null }, now: Date): ConsentStatus {
  if ((grant.status === "requested" || grant.status === "active") && grant.expires_at && new Date(grant.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return grant.status;
}

/** True only for a grant that is active NOW and approved for this category. */
export function consentPermits(
  grant: { status: ConsentStatus; expires_at: string | null; approved_categories: readonly DataCategory[] },
  category: DataCategory,
  now: Date,
): boolean {
  return effectiveConsentStatus(grant, now) === "active" && grant.approved_categories.includes(category);
}

export function isSensitiveCategory(category: DataCategory): boolean {
  return SENSITIVE_DATA_CATEGORIES.includes(category);
}
