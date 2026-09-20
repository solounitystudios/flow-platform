import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClaimExplanation, CLAIM_STATUSES } from "@flow/passport-contracts";
import { claimStatusPresentation, explainClaim } from "@/lib/passport/domain";
import { ClaimExplanationCard } from "@/components/passport/ClaimExplanationCard";
import { PublicVerifiedClaims } from "@/components/passport/PublicVerifiedClaims";

/**
 * What a viewer actually receives as HTML. The explanation RPC already scopes
 * the data by viewer; these tests pin that the rendering layer adds nothing
 * back — no evidence kinds, notes, reason codes, source refs or reviewer
 * detail can appear in a public viewer's markup.
 */

const U = { claim: "11111111-1111-4111-8111-111111111111", subject: "22222222-2222-4222-8222-222222222222", ev: "33333333-3333-4333-8333-333333333333" };

const owner = () => ({
  viewer: "owner",
  claim: { id: U.claim, claim_type: "participation.activity", subject: { type: "person", id: U.subject }, status: "verified", effective_status: "verified", effective_at: "2026-08-01T00:00:00Z", expires_at: null, visibility: "public", created_at: "2026-07-30T00:00:00Z", sensitivity: "standard", status_reason_code: null },
  source: { system: "flow_platform", ref: "activity_participants:INTERNAL-REF-77" },
  issuer: { kind: "entity", entity_type: "organization", label: "Buffalo Welding Guild" },
  verification: { method: "platform_verified", verifier: { kind: "system", label: "Flow" }, decided_at: "2026-08-02T00:00:00Z", expires_at: null, reason_code: "source_record" },
  evidence: [{ id: U.ev, evidence_type: "activity_outcome", source_kind: "flow_activity", captured_at: "2026-07-30T00:00:00Z", sensitivity: "standard", status: "accepted", artifact_count: 0, role: "supports" }],
  pending_verifications: [],
  history: [{ type: "claim.created", at: "2026-07-30T00:00:00Z" }, { type: "claim.verified", at: "2026-08-02T00:00:00Z" }],
});

const asPublic = () => ({
  ...owner(),
  viewer: "public",
  claim: { ...owner().claim, sensitivity: null, status_reason_code: null },
  source: { system: "flow_platform", ref: null },
  verification: { ...owner().verification, reason_code: null },
  evidence: { count: 1 },
  history: [],
});

const render = (raw: unknown, title = "Welding workshop (Workshop)") => renderToStaticMarkup(createElement(ClaimExplanationCard, { explanation: ClaimExplanation.parse(raw), title }));

describe("claim status presentation", () => {
  it("is the single source of status wording: the list and the explanation can never disagree", () => {
    for (const status of CLAIM_STATUSES) {
      const explained = explainClaim(ClaimExplanation.parse({ ...owner(), claim: { ...owner().claim, status, effective_status: status } }));
      expect(explained.status).toEqual(claimStatusPresentation(status));
    }
  });

  it("only 'verified' is ever presented as verified — submitted evidence and pending review are not", () => {
    const tones = Object.fromEntries(CLAIM_STATUSES.map((s) => [s, claimStatusPresentation(s).tone]));
    expect(Object.entries(tones).filter(([, tone]) => tone === "verified").map(([s]) => s)).toEqual(["verified"]);
    expect(claimStatusPresentation("submitted").label).toMatch(/not yet verified/i);
  });
});

describe("ClaimExplanationCard — owner", () => {
  it("shows the whole chain, including evidence metadata and history", () => {
    const html = render(owner());
    expect(html).toContain("Why does Passport show this?");
    expect(html).toContain("Passport shows this because it was verified by Flow.");
    expect(html).toContain("Flow&#x27;s own records");
    expect(html).toContain("Flow activity record");
    expect(html).toContain("Confirmed from the source record");
    expect(html).toContain("claim · verified");
    expect(html).toContain("full chain");
  });

  it("never renders artifact references, even as evidence lines", () => {
    expect(render(owner())).not.toMatch(/artifact|storage|flow_storage|\.pdf/i);
  });
});

describe("ClaimExplanationCard — public viewer", () => {
  const html = render(asPublic());

  it("answers the question with what a public claim warrants", () => {
    expect(html).toContain("Passport shows this because it was verified by Flow.");
    expect(html).toContain("Buffalo Welding Guild");
    expect(html).toContain("1 item (not shown)");
  });

  it("carries no private evidence, reason, source reference, history or reviewer detail", () => {
    for (const secret of ["INTERNAL-REF", "activity_participants", "Confirmed from the source record", "source_record", "Flow activity record", "Evidence on file", "What happened", "claim · created", "restricted", "sensitivity"]) {
      expect(html, secret).not.toContain(secret);
    }
  });

  it("tells the viewer plainly that evidence stays private", () => {
    expect(html).toContain("Evidence and reviewer details stay private");
  });
});

describe("PublicVerifiedClaims", () => {
  const claims = [{ id: U.claim, claim_type: "participation.activity", title: "Welding workshop (Workshop)", effective_at: "2026-08-01T00:00:00Z", expires_at: null }];

  it("renders nothing when there are no public claims (no empty 'Verified' box for a stranger)", () => {
    expect(renderToStaticMarkup(createElement(PublicVerifiedClaims, { claims: [], username: "sam" }))).toBe("");
  });

  it("lists the title and links to the explanation under the SAME Passport", () => {
    const html = renderToStaticMarkup(createElement(PublicVerifiedClaims, { claims, username: "sam" }));
    expect(html).toContain("Welding workshop (Workshop)");
    expect(html).toContain(`href="/p/sam/claims/${U.claim}"`);
  });
});
