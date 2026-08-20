// FLOW-SEC-001 — Cross-Organization Listing Attribution.
//
// Permanent regression coverage for the vulnerability fixed in
// supabase/migrations/20260820134812_organization_attribution_authorization.sql:
// createOpportunityAction/createEventAction (lib/actions.ts) used to insert
// a client-supplied `organization_id` with no ownership check, so any
// authenticated user could attribute a public opportunity or event to any
// organization. `canAttributeToOrganization` (lib/authz.ts) is the single
// predicate both the server actions AND the RLS WITH CHECK clause encode —
// this file is the TypeScript-side half of the regression; the RLS half is
// exercised by tests/integration/flow-sec-001.rls.test.ts (credential-gated,
// not part of the default/CI-required run — see tests/README.md).
//
// The same predicate models both "can this user create an org-attributed
// posting" (INSERT) and "can this user reassign an existing posting's
// organization" (UPDATE) — the RLS WITH CHECK clause is identical for both,
// since `opportunities_creator_manage`/`events_creator_manage` are `for all`
// policies. There is no separate app code path for reassignment today (only
// status-only updates exist), so this predicate is the entire authorization
// surface for organization attribution, for both opportunities and events.
import { describe, expect, it } from "vitest";
import { canAttributeToOrganization } from "@/lib/authz";

describe("FLOW-SEC-001: canAttributeToOrganization (opportunity/event creation)", () => {
  it("owner attributing to their own organization: PASS", () => {
    expect(canAttributeToOrganization("org-1", "org-1")).toBe(true);
  });

  it("owner attributing to a DIFFERENT organization they don't own: DENY", () => {
    expect(canAttributeToOrganization("org-1", "org-2")).toBe(false);
  });

  it("unrelated authenticated user (owns no organization) attributing to any organization: DENY", () => {
    expect(canAttributeToOrganization(null, "org-2")).toBe(false);
  });

  it("no organization attribution requested (personal/unattributed posting): PASS regardless of ownership", () => {
    expect(canAttributeToOrganization(null, null)).toBe(true);
    expect(canAttributeToOrganization("org-1", null)).toBe(true);
  });
});

describe("FLOW-SEC-001: canAttributeToOrganization (opportunity/event update — same predicate, see file header)", () => {
  it("cannot reassign an existing listing to an organization the caller doesn't own", () => {
    // Simulates: caller owns org-1, attempts to update organization_id to org-2.
    expect(canAttributeToOrganization("org-1", "org-2")).toBe(false);
  });

  it("can keep/re-affirm attribution to an organization the caller does own", () => {
    expect(canAttributeToOrganization("org-1", "org-1")).toBe(true);
  });

  it("can clear attribution back to personal/unattributed", () => {
    expect(canAttributeToOrganization("org-1", null)).toBe(true);
  });
});
