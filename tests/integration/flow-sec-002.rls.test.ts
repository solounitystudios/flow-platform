// FLOW-SEC-002 — Event ↔ Opportunity organization integrity (Batch A:
// Event Team Builder). DB/action-level matrix (STAGING_ONLY).
//
// tests/security/flow-sec-002.test.ts covers the TypeScript-side predicate
// (canLinkOpportunityToEvent) with zero external dependencies — that file
// is part of the required, credential-free baseline (`npm run test`) and
// runs in CI on every push/PR.
//
// This file is the other half: proving createOpportunityAction's full
// server-side behavior (event lookup, event_id persistence, and the
// query-scoping of getOpportunitiesForEvent) for scenarios that need a
// real Supabase project and real rows — this repo has no staging project
// today (see .claude/FLOW_ORCHESTRATION.md's Supabase safety rules; the
// same gap already blocks tests/integration/flow-sec-001.rls.test.ts).
// Documented here as `it.todo(...)` so it's visible as pending, not
// silently missing, and not counted as a failure. A future batch that
// provisions a staging Supabase project should implement these against it.
import { describe, it } from "vitest";

describe.todo("FLOW-SEC-002 event-link matrix (STAGING_ONLY — needs a staging Supabase project, see file header)", () => {
  it.todo("createOpportunityAction: no event_id supplied — insert succeeds with event_id null, unchanged from pre-Batch-A behavior");
  it.todo("createOpportunityAction: event_id references a real event owned by the same organization — insert succeeds, event_id persisted");
  it.todo("createOpportunityAction: event_id references a nonexistent event — rejected with an error, no row inserted");
  it.todo("createOpportunityAction: event_id references a real event owned by a DIFFERENT organization — rejected with an error, no row inserted (defense-in-depth: same outcome even if a client bypasses the picker and POSTs directly)");
  it.todo("createOpportunityAction: event_id references the organizer's own cancelled or completed event — rejected with an error, no row inserted (defense-in-depth: same outcome even if a client bypasses the picker, which already excludes these from its options)");
  it.todo("getOpportunitiesForEvent: returns only opportunities whose event_id matches the requested event, excluding opportunities linked to other events and unlinked opportunities");
  it.todo("existing non-event opportunity creation (no event_id field submitted at all, e.g. an older cached form) remains fully unchanged");
  it.todo("existing application lifecycle (apply/accept/complete/no_show/cancel/worker_ack) on an event-linked opportunity behaves identically to a non-linked one — no special-case branching");
  it.todo("an event-linked opportunity's completed application still reaches the existing Evidence CTA / submitEvidenceAction path (components/applications/WorkCard.tsx, components/settings/EvidencePanel.tsx) with zero event-specific code — event_id is irrelevant to that flow");
  it.todo("linking an opportunity to an event never creates an event_attendance row for the assigned worker — staff participation stays on the applications lifecycle only");
});
