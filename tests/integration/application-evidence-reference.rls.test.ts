// "Application Evidence Reference" (Priority #1 Batch 1) — DB/RLS-level
// matrix (STAGING_ONLY).
//
// tests/security/application-evidence-authz.test.ts covers the
// TypeScript-side predicate (canSubmitApplicationEvidence) with zero
// external dependencies — that file is part of the required,
// credential-free baseline (`npm run test`) and runs in CI on every
// push/PR.
//
// This file is the other half: proving the database itself independently
// enforces the same rules (is_application_participant(),
// verifications_self_insert's WITH CHECK, confirm_verification_as_
// collaborator()'s new application branch, the reference-lookup index, and
// the active-claim uniqueness index) for scenarios that need real Supabase
// auth users and real rows. This repo has no staging Supabase project today
// (see .claude/FLOW_ORCHESTRATION.md's Supabase safety rules) — the same
// gap already documented by tests/integration/flow-sec-001.rls.test.ts and
// tests/integration/flow-sec-002.rls.test.ts. Documented here as
// `it.todo(...)` so it's visible as pending, not silently missing, and not
// counted as a failure.
import { describe, it } from "vitest";

describe.todo("Application Evidence Reference — DB matrix (STAGING_ONLY — needs a staging Supabase project, see file header)", () => {
  it.todo("is_application_participant: own completed application returns true");
  it.todo("is_application_participant: own accepted (not completed) application returns false");
  it.todo("is_application_participant: someone else's completed application returns false");
  it.todo("is_application_participant: nonexistent application_id returns false");
  it.todo("verifications_self_insert: reference_table='application' self-insert succeeds for own completed application, status forced pending");
  it.todo("verifications_self_insert: reference_table='application' self-insert rejected for someone else's application (RLS denies the insert, not just the app layer)");
  it.todo("verifications_self_insert: reference_table='application' self-insert rejected for own not-yet-completed application");
  it.todo("submitEvidenceAction: witness_profile_id is always derived server-side from opportunity.created_by for application claims, never from client-supplied witness_username");
  it.todo("confirm_verification_as_collaborator: the application's opportunity creator can confirm a pending application-linked claim");
  it.todo("confirm_verification_as_collaborator: a random authenticated user (not the named witness) is rejected with not_authorized");
  it.todo("confirm_verification_as_collaborator: a DIFFERENT opportunity's creator (named witness on a claim they don't actually own) is rejected with not_the_opportunity_creator — live re-derivation, not just witness_profile_id equality");
  it.todo("confirm_verification_as_collaborator: if the application's status changes away from 'completed' between submission and confirmation, confirmation is rejected with application_not_completed");
  it.todo("confirm_verification_as_collaborator: existing profile_skill and creative_project branches remain unchanged (regression)");
  it.todo("verifications_active_claim_unique_idx: a second pending/verified claim against the same (profile_id, reference_table, reference_id) is rejected by the DB");
  it.todo("verifications_active_claim_unique_idx: a new claim IS allowed after a prior claim against the same reference was rejected/revoked (historical resubmission not blocked)");
  it.todo("event-staffed applications (opportunities.event_id set) flow through is_application_participant()/confirm_verification_as_collaborator() identically to any other application — no special-casing needed");
  it.todo("linking application evidence never creates or modifies any event_attendance row");
  it.todo("submitting or confirming application evidence never changes recompute_reliability()'s output or inserts a flow_ledger row");
  it.todo("existing profile_skill and creative_project self-insert/confirm paths are unaffected by the new CHECK constraint and RLS branch (regression)");
});
