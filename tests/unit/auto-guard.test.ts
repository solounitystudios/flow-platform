// Auto Guard changed-file classifier — regression coverage for the routing
// table itself (lib/admin/test-lab/auto-guard.ts), since a silent typo in a
// path pattern would mean the wrong suite runs for a real change.
import { describe, expect, it } from "vitest";
import { recommendedSuitesFor } from "@/lib/admin/test-lab/auto-guard";

describe("recommendedSuitesFor", () => {
  it("a migration change recommends security + release", () => {
    const suites = recommendedSuitesFor(["supabase/migrations/20260820134812_organization_attribution_authorization.sql"]);
    expect(suites).toContain("security");
    expect(suites).toContain("release");
  });

  it("an employer/business change recommends employer", () => {
    expect(recommendedSuitesFor(["app/(app)/business/team/actions.ts"])).toContain("employer");
  });

  it("a map change recommends map", () => {
    expect(recommendedSuitesFor(["lib/map-selectors.ts"])).toContain("map");
  });

  it("a shared UI change recommends quick", () => {
    expect(recommendedSuitesFor(["components/ui/Button.tsx"])).toContain("quick");
  });

  it("an unrecognized path falls back to quick rather than matching nothing", () => {
    expect(recommendedSuitesFor(["README.md"])).toEqual(["quick"]);
  });

  it("a change touching multiple categories unions their suites", () => {
    const suites = recommendedSuitesFor(["lib/actions.ts", "lib/map-selectors.ts"]);
    expect(suites).toContain("security");
    expect(suites).toContain("map");
  });
});
