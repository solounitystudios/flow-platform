// Batch 16 — Creative Project-linked Passport verification, extended by
// "Application Evidence Reference" (Priority #1 Batch 1) for a third
// reference type. The pure, DB-independent piece of logic in both batches:
// which reference (skill vs. creative project vs. application) a submitted
// evidence claim gets tagged with. See lib/verification-actions.ts's
// submitEvidenceAction.
import { describe, expect, it } from "vitest";
import { resolveEvidenceReference } from "@/lib/data/verifications";

describe("resolveEvidenceReference", () => {
  it("returns null/null when nothing is chosen", () => {
    expect(resolveEvidenceReference("", "", "")).toEqual({ reference_table: null, reference_id: null });
  });

  it("references profile_skill when only a skill is chosen", () => {
    expect(resolveEvidenceReference("skill-123", "", "")).toEqual({
      reference_table: "profile_skill",
      reference_id: "skill-123",
    });
  });

  it("references creative_project when only a project is chosen", () => {
    expect(resolveEvidenceReference("", "project-456", "")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });

  it("references application when only an application is chosen", () => {
    expect(resolveEvidenceReference("", "", "app-789")).toEqual({
      reference_table: "application",
      reference_id: "app-789",
    });
  });

  it("prefers creative_project over skill when both are somehow submitted", () => {
    expect(resolveEvidenceReference("skill-123", "project-456", "")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });

  it("prefers creative_project over application when both are somehow submitted", () => {
    expect(resolveEvidenceReference("", "project-456", "app-789")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });

  it("prefers skill over application when both are somehow submitted", () => {
    expect(resolveEvidenceReference("skill-123", "", "app-789")).toEqual({
      reference_table: "profile_skill",
      reference_id: "skill-123",
    });
  });

  it("prefers creative_project when all three are somehow submitted", () => {
    expect(resolveEvidenceReference("skill-123", "project-456", "app-789")).toEqual({
      reference_table: "creative_project",
      reference_id: "project-456",
    });
  });
});
