// "Application Evidence Reference" (Priority #1 Batch 1) — permanent
// regression coverage for canSubmitApplicationEvidence (lib/authz.ts), the
// TypeScript-side twin of is_application_participant() (supabase/migrations/
// 20260824230000_verifications_application_reference.sql), which
// verifications_self_insert's RLS WITH CHECK actually enforces. This
// predicate is used both for UI gating (WorkCard.tsx / EvidencePanel.tsx)
// and by getApplicationEvidenceContext (lib/data/verifications.ts) to decide
// eligibility server-side — the DB function is the real authorization
// boundary either way.
import { describe, expect, it } from "vitest";
import { canSubmitApplicationEvidence } from "@/lib/authz";

describe("canSubmitApplicationEvidence", () => {
  const callerId = "worker-1";

  it("own completed application: PASS", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "completed" }, callerId)).toBe(true);
  });

  it("own accepted (not yet completed) application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "accepted" }, callerId)).toBe(false);
  });

  it("own pending application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "pending" }, callerId)).toBe(false);
  });

  it("own rejected application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "rejected" }, callerId)).toBe(false);
  });

  it("own withdrawn application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "withdrawn" }, callerId)).toBe(false);
  });

  it("own no_show application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "no_show" }, callerId)).toBe(false);
  });

  it("own cancelled application: DENY", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "cancelled" }, callerId)).toBe(false);
  });

  it("someone else's completed application: DENY (cannot submit evidence for another worker's gig)", () => {
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-2", status: "completed" }, callerId)).toBe(false);
  });

  it("no application (null — nonexistent or unresolvable application_id): DENY", () => {
    expect(canSubmitApplicationEvidence(null, callerId)).toBe(false);
  });

  it("is NOT gated on worker_ack_at — the predicate's type signature has no such field, by design (see doc comment in lib/authz.ts)", () => {
    // Deliberately no worker_ack_at in the input shape at all — asserting
    // the function only ever inspects applicant_id/status is implicit in
    // every case above, but this pins the intent explicitly so a future
    // edit can't silently reintroduce that gate without this test forcing
    // a visible signature change.
    expect(canSubmitApplicationEvidence({ applicant_id: "worker-1", status: "completed" }, callerId)).toBe(true);
  });
});
