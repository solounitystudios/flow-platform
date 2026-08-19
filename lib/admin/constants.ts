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
