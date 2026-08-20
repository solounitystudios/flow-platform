export const ADMIN_ROLES = ["owner", "admin", "operations", "sales"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Pipeline stage values as enforced by the business_leads_pipeline_stage_check
 * constraint in supabase/migrations/20260819035422_admin_employer_outreach_mvp.sql.
 * The constraint uses demo_scheduled/demo_completed (not
 * demonstration_scheduled/demonstration_completed) — this file matches the
 * live database exactly rather than a longer naming that would violate it.
 */
export const PIPELINE_STAGES = [
  { value: "identified", label: "Identified" },
  { value: "researched", label: "Researched" },
  { value: "contact_attempted", label: "Contact attempted" },
  { value: "decision_maker_reached", label: "Decision-maker reached" },
  { value: "demo_scheduled", label: "Demo scheduled" },
  { value: "demo_completed", label: "Demo completed" },
  { value: "pilot_offered", label: "Pilot offered" },
  { value: "pilot_accepted", label: "Pilot accepted" },
  { value: "onboarding_started", label: "Onboarding started" },
  { value: "organization_verified", label: "Organization verified" },
  { value: "first_opportunity_posted", label: "First opportunity posted" },
  { value: "first_opportunity_completed", label: "First opportunity completed" },
  { value: "repeat_employer", label: "Repeat employer" },
  { value: "not_interested", label: "Not interested" },
  { value: "follow_up_later", label: "Follow up later" },
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number]["value"];

export const CONTACT_METHODS = [
  { value: "visit", label: "Visit" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "social", label: "Social" },
  { value: "referral", label: "Referral" },
] as const;

export const ACTIVITY_METHODS = [
  { value: "visit", label: "Visit" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "social", label: "Social" },
  { value: "meeting", label: "Meeting" },
  { value: "demo", label: "Demo" },
  { value: "other", label: "Other" },
] as const;

export const TASK_TYPES = [
  { value: "follow_up", label: "Follow-up" },
  { value: "call", label: "Call" },
  { value: "visit", label: "Visit" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Demo" },
  { value: "onboarding", label: "Onboarding" },
  { value: "verification", label: "Verification" },
  { value: "other", label: "Other" },
] as const;

export const VERIFICATION_STATUSES = [
  { value: "pending", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "information_requested", label: "Needs information" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspicious_duplicate", label: "Suspicious / duplicate" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
] as const;

export const DECISION_REASON_CODES = [
  { value: "identity_confirmed", label: "Identity confirmed" },
  { value: "address_confirmed", label: "Address confirmed" },
  { value: "domain_confirmed", label: "Domain confirmed" },
  { value: "incomplete_documentation", label: "Incomplete documentation" },
  { value: "unverifiable_address", label: "Unverifiable address" },
  { value: "duplicate_listing", label: "Duplicate listing" },
  { value: "suspected_fraud", label: "Suspected fraud" },
  { value: "domain_mismatch", label: "Domain mismatch" },
  { value: "license_missing", label: "License missing" },
  { value: "other", label: "Other" },
] as const;

export const INTEREST_LEVELS = [
  { value: "unknown", label: "Unknown" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

/** Stages in pipeline order — used to rank progress for funnel metrics and
 * to guard against decide_verification_case()'s auto-advance ever moving a
 * lead backward. Mirrors the array literal inside that RPC exactly. */
export const PIPELINE_STAGE_ORDER = PIPELINE_STAGES.filter((s) => s.value !== "not_interested" && s.value !== "follow_up_later").map((s) => s.value);

export const INVITATION_STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "accepted", label: "Accepted" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
  { value: "none", label: "No invitation sent" },
] as const;

export const FOLLOW_UP_STATUS_FILTERS = [
  { value: "overdue", label: "Overdue follow-up" },
  { value: "upcoming", label: "Upcoming follow-up" },
  { value: "none", label: "No follow-up set" },
] as const;

// ── V1+ Passport evidence review ──────────────────────────────────────────

export const EVIDENCE_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
] as const;

export const EVIDENCE_REASON_CODES = [
  { value: "identity_confirmed", label: "Identity confirmed" },
  { value: "evidence_verified", label: "Evidence verified against source" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
  { value: "broken_or_invalid_link", label: "Broken or invalid link" },
  { value: "does_not_match_claim", label: "Evidence doesn't match claim" },
  { value: "expired_credential", label: "Credential expired" },
  { value: "policy_violation", label: "Policy violation" },
  { value: "other", label: "Other" },
] as const;

export const EVIDENCE_METHODS = [
  { value: "manual_review", label: "Manual review" },
  { value: "link_check", label: "Link check" },
  { value: "third_party_confirmation", label: "Third-party confirmation" },
  { value: "document_review", label: "Document review" },
] as const;

// ── Content moderation: opportunities / events ─────────────────────────────
// Values match each table's existing check constraint exactly
// (opportunities_status_check / events_status_check — see
// supabase/migrations/20260819171934_admin_content_read_and_moderation_rpcs.sql,
// which does not add or change any status value, only read/write access to
// the existing column). Opportunities and events deliberately keep their own
// pre-existing status vocabulary here rather than the general
// Draft → Review → Published → Paused → Expired → Archived lifecycle used
// elsewhere in the admin surface, because that vocabulary is what the live
// schema's check constraints actually enforce — introducing new values is
// out of scope for this batch.

export const OPPORTUNITY_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "filled", label: "Filled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const EVENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
] as const;
