// Batch 16 — Creative Project-linked Passport verification. The one piece
// of new application logic in that batch that's pure and DB-independent:
// which reference (skill vs. creative project) a submitted evidence claim
// gets tagged with. See lib/verification-actions.ts's submitEvidenceAction.
import { describe, expect, it } from "vitest";
import { resolveEvidenceReference } from "@/lib/data/verifications";

describe("resolveEvidenceReference", () => {
  it("returns null/null when neither a skill nor a project is chosen", () => {
    expect(resolveEvidenceReference("", "")).toEqual({ reference_table: null, reference_id: null });
  });

  it("references profile_skill when only a skill is chosen", () => {
    expect(resolveEvidenceReference("skill-123", "")).toEqual({
      reference_table: "profile_skill",
      reference_id: "skill-123",
    });
  });

  it("references creative_project when only a project is chosen", () => {
    expect(resolveEvidenceReference("", "project-456")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });

  it("prefers creative_project over skill when both are somehow submitted", () => {
    expect(resolveEvidenceReference("skill-123", "project-456")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });
});
