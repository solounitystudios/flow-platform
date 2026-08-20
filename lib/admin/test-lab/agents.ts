// FLOW Test Lab — Phase 1 agents.
//
// Each agent here is a deterministic function, not an autonomous LLM
// process — per this batch's explicit design goal: "design for future
// AI-agent orchestration without faking capabilities today." A dashboard
// button that claims to run a "Security Agent" but silently does nothing,
// or worse, fabricates a PASS, would be worse than not having the feature
// at all. Every scenario below directly calls a real exported function from
// this repo's pure, dependency-free modules (lib/authz.ts,
// lib/map-selectors.ts, lib/redirect-safety.ts) — the exact same functions
// tests/security/ and tests/unit/ assert against — so a Test Lab result and
// a `npm run test` result can never silently disagree; there is only one
// implementation of each rule, not a parallel copy.
//
// All Phase 1 agents are SuiteSafety: SAFE_PRODUCTION — pure in-memory
// computation, zero database reads or writes, safe to run against the live
// app at any time (including in production) by a signed-in AAL2 admin.
import { canAttributeToOrganization, canManageOrganizationMember, deriveAdminAccessState, INVITABLE_ORGANIZATION_ROLES } from "@/lib/authz";
import { isSafeInternalPath } from "@/lib/redirect-safety";
import { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems } from "@/lib/map-selectors";
import type { MockEvent, MockOpportunity, MockOrganization } from "@/lib/types";
import type { TestLabAgent, TestResult } from "./types";

function pass(scenario: string, agent: string, category: string, severity: TestResult["severity"], expected: string, evidence: string): TestResult {
  return { scenario, agent, category, severity, expected, actual: expected, status: "PASS", evidence, suggestedNextAction: null };
}

function fail(scenario: string, agent: string, category: string, severity: TestResult["severity"], expected: string, actual: string, evidence: string, suggestedNextAction: string): TestResult {
  return { scenario, agent, category, severity, expected, actual, status: "FAIL", evidence, suggestedNextAction };
}

function check(condition: boolean, args: {
  scenario: string; agent: string; category: string; severity: TestResult["severity"];
  expected: string; actualIfFail: string; evidence: string; suggestedNextAction: string;
}): TestResult {
  return condition
    ? pass(args.scenario, args.agent, args.category, args.severity, args.expected, args.evidence)
    : fail(args.scenario, args.agent, args.category, args.severity, args.expected, args.actualIfFail, args.evidence, args.suggestedNextAction);
}

const ORG_A = "org-a";
const ORG_B = "org-b";

// ── Security Agent ─────────────────────────────────────────────────────

function runSecurityAgent(): TestResult[] {
  const agent = "Security Agent";
  return [
    check(canAttributeToOrganization(ORG_A, ORG_A) === true, {
      scenario: "FLOW-SEC-001: owner attributes a listing to their own organization",
      agent, category: "organization-attribution", severity: "HIGH",
      expected: "PASS", actualIfFail: "DENY",
      evidence: "canAttributeToOrganization(ORG_A, ORG_A)",
      suggestedNextAction: "Investigate lib/authz.ts:canAttributeToOrganization — legitimate owner postings are being blocked.",
    }),
    check(canAttributeToOrganization(ORG_A, ORG_B) === false, {
      scenario: "FLOW-SEC-001: user attributes a listing to an organization they don't own",
      agent, category: "organization-attribution", severity: "HIGH",
      expected: "DENY", actualIfFail: "PASS (vulnerable)",
      evidence: "canAttributeToOrganization(ORG_A, ORG_B)",
      suggestedNextAction: "STOP — this is FLOW-SEC-001 regressing. Re-review supabase/migrations/20260820134812_organization_attribution_authorization.sql and lib/actions.ts's createOpportunityAction/createEventAction before any release.",
    }),
    check(canAttributeToOrganization(null, ORG_B) === false, {
      scenario: "FLOW-SEC-001: an unrelated user (owns no organization) attributes a listing to any organization",
      agent, category: "organization-attribution", severity: "HIGH",
      expected: "DENY", actualIfFail: "PASS (vulnerable)",
      evidence: "canAttributeToOrganization(null, ORG_B)",
      suggestedNextAction: "STOP — same FLOW-SEC-001 regression as above.",
    }),
    check(canAttributeToOrganization(ORG_A, null) === true, {
      scenario: "Personal/unattributed posting (no organization_id) always remains allowed",
      agent, category: "organization-attribution", severity: "MEDIUM",
      expected: "PASS", actualIfFail: "DENY",
      evidence: "canAttributeToOrganization(ORG_A, null)",
      suggestedNextAction: "This would block ordinary personal gig postings — check for an overly broad condition in canAttributeToOrganization.",
    }),
    check(isSafeInternalPath("/dashboard") === true, {
      scenario: "Same-origin redirect target is accepted",
      agent, category: "open-redirect", severity: "MEDIUM",
      expected: "accepted", actualIfFail: "rejected",
      evidence: 'isSafeInternalPath("/dashboard")',
      suggestedNextAction: "Legitimate internal redirects (login/signup/auth callback) would break — review isSafeInternalPath.",
    }),
    check(isSafeInternalPath("//evil.com") === false, {
      scenario: "Scheme-relative external redirect target is rejected",
      agent, category: "open-redirect", severity: "HIGH",
      expected: "rejected", actualIfFail: "accepted (open redirect)",
      evidence: 'isSafeInternalPath("//evil.com")',
      suggestedNextAction: "STOP — this reopens an open-redirect vector across login/signup/auth callback/employer invite. Review lib/redirect-safety.ts immediately.",
    }),
    check(isSafeInternalPath("https://evil.com") === false, {
      scenario: "Fully-qualified external redirect target is rejected",
      agent, category: "open-redirect", severity: "HIGH",
      expected: "rejected", actualIfFail: "accepted (open redirect)",
      evidence: 'isSafeInternalPath("https://evil.com")',
      suggestedNextAction: "STOP — same open-redirect exposure as above.",
    }),
    check(deriveAdminAccessState({ hasUser: true, isAdmin: false, aal2: false, hasVerifiedMfaFactor: true }) === "not-admin", {
      scenario: "Admin Access Gateway: a verified second factor does not, by itself, imply admin rights",
      agent, category: "admin-access-gateway", severity: "HIGH",
      expected: "not-admin", actualIfFail: "some admin-implying state (privilege escalation via MFA enrollment alone)",
      evidence: "deriveAdminAccessState({hasUser:true, isAdmin:false, aal2:false, hasVerifiedMfaFactor:true})",
      suggestedNextAction: "STOP — review lib/authz.ts's deriveAdminAccessState precedence order.",
    }),
    check(deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: false, hasVerifiedMfaFactor: false }) === "mfa-not-enrolled", {
      scenario: "Admin Access Gateway: an admin with no second factor is never treated as verified",
      agent, category: "admin-access-gateway", severity: "HIGH",
      expected: "mfa-not-enrolled", actualIfFail: "aal2 (AAL2 gate would be bypassed)",
      evidence: "deriveAdminAccessState({hasUser:true, isAdmin:true, aal2:false, hasVerifiedMfaFactor:false})",
      suggestedNextAction: "STOP — this would mean an unverified admin session is treated as fully secure. Review deriveAdminAccessState and requireSecureAdmin.",
    }),
  ];
}

// ── Employer Agent ─────────────────────────────────────────────────────

function runEmployerAgent(): TestResult[] {
  const agent = "Employer Agent";
  const owner = { role: "owner", profile_id: "owner-1" };
  const admin = { role: "admin", profile_id: "member-1" };
  return [
    check(canManageOrganizationMember(admin, "owner-1") === true, {
      scenario: "Organization owner can suspend/remove a non-owner member",
      agent, category: "team-management", severity: "MEDIUM",
      expected: "allowed", actualIfFail: "blocked",
      evidence: 'canManageOrganizationMember({role:"admin",...}, "owner-1")',
      suggestedNextAction: "Legitimate team management would be broken — review canManageOrganizationMember.",
    }),
    check(canManageOrganizationMember(owner, "owner-1") === false, {
      scenario: "Organization owner cannot suspend/remove their own owner row",
      agent, category: "owner-self-protection", severity: "HIGH",
      expected: "blocked", actualIfFail: "allowed (owner could remove themselves / be reassigned unsafely)",
      evidence: 'canManageOrganizationMember({role:"owner", profile_id:"owner-1"}, "owner-1")',
      suggestedNextAction: "STOP — an org could be left without a manageable owner. Review canManageOrganizationMember and the organization_members_owner_manage RLS policy.",
    }),
    check(canManageOrganizationMember(admin, "member-1") === false, {
      scenario: "A member cannot target their own membership row",
      agent, category: "self-protection", severity: "MEDIUM",
      expected: "blocked", actualIfFail: "allowed",
      evidence: 'canManageOrganizationMember({..., profile_id:"member-1"}, "member-1")',
      suggestedNextAction: "Review canManageOrganizationMember's self-targeting check.",
    }),
    check(!INVITABLE_ORGANIZATION_ROLES.includes("owner" as (typeof INVITABLE_ORGANIZATION_ROLES)[number]), {
      scenario: "'owner' is never a role grantable through the invite flow",
      agent, category: "role-restriction", severity: "HIGH",
      expected: "'owner' excluded", actualIfFail: "'owner' invitable (privilege escalation)",
      evidence: "INVITABLE_ORGANIZATION_ROLES",
      suggestedNextAction: "STOP — this would let an owner grant a second owner-equivalent account. Review lib/authz.ts's INVITABLE_ORGANIZATION_ROLES and the organization_members_owner_invite RLS policy's role <> 'owner' check.",
    }),
  ];
}

// ── Map Agent ───────────────────────────────────────────────────────────

const ORG_REF = { id: "org-1", name: "Test Org", logo_url: "", verified: true };

function baseOpportunity(overrides: Partial<MockOpportunity> = {}): MockOpportunity {
  return {
    id: "opp-1", organization: ORG_REF, title: "t", description: "", opportunity_type: "gig", status: "open",
    city: "Buffalo", state: "NY", location_name: "x", lat: 42.8864, lng: -78.8784,
    starts_at: new Date().toISOString(), ends_at: null, pay_cents: null, slots: 1, slots_filled: 0,
    distance_mi: 1, urgent: false, is_remote: false, ...overrides,
  };
}
function baseEvent(overrides: Partial<MockEvent> = {}): MockEvent {
  return {
    id: "evt-1", organization: ORG_REF, title: "t", description: "", city: "Buffalo", state: "NY", venue: "x",
    lat: 42.8864, lng: -78.8784, starts_at: new Date().toISOString(), ends_at: new Date().toISOString(),
    capacity: 100, registered: 0, status: "published", cover_url: "", price_cents: 0, category: "Networking",
    ...overrides,
  };
}
function baseOrganization(overrides: Partial<MockOrganization> = {}): MockOrganization {
  return {
    id: "org-1", name: "t", logo_url: "", city: "Buffalo", state: "NY", description: "", verified: true,
    industry: "Business", member_perk: null, rating: null, lat: 42.8864, lng: -78.8784, location_visibility: "exact", ...overrides,
  };
}

function runMapAgent(): TestResult[] {
  const agent = "Map Agent";
  return [
    check(opportunitiesToMapItems([baseOpportunity({ lat: null, lng: null })]).length === 0, {
      scenario: "Opportunity with no coordinates produces no pin (never a city-center fallback)",
      agent, category: "location-safety", severity: "MEDIUM",
      expected: "0 pins", actualIfFail: "1+ pins (fabricated location)",
      evidence: "opportunitiesToMapItems([{lat:null,lng:null}])",
      suggestedNextAction: "STOP — a fabricated pin misleads users about a real-world location. Review lib/data/opportunities.ts's toCardShape for a reintroduced coalesce-to-CITY_CENTER.",
    }),
    check(opportunitiesToMapItems([baseOpportunity({ is_remote: true })]).length === 0, {
      scenario: "Remote opportunity produces no geographic pin, even with coordinates set",
      agent, category: "location-safety", severity: "LOW",
      expected: "0 pins", actualIfFail: "1+ pins",
      evidence: "opportunitiesToMapItems([{is_remote:true, lat:..., lng:...}])",
      suggestedNextAction: "Review the is_remote exclusion in lib/map-selectors.ts's opportunitiesToMapItems filter.",
    }),
    check(eventsToMapItems([baseEvent({ lat: null, lng: null })]).length === 0, {
      scenario: "Event with no coordinates produces no pin",
      agent, category: "location-safety", severity: "MEDIUM",
      expected: "0 pins", actualIfFail: "1+ pins (fabricated location)",
      evidence: "eventsToMapItems([{lat:null,lng:null}])",
      suggestedNextAction: "Review lib/data/events.ts's toCardShape for a reintroduced coalesce-to-CITY_CENTER.",
    }),
    check(organizationsToMapItems([baseOrganization({ lat: null, lng: null })]).length === 0, {
      scenario: "Business coordinates are never fabricated — an org with none produces no pin",
      agent, category: "location-safety", severity: "MEDIUM",
      expected: "0 pins", actualIfFail: "1+ pins (fabricated business location)",
      evidence: "organizationsToMapItems([{lat:null,lng:null}])",
      suggestedNextAction: "Review lib/map-selectors.ts's organizationsToMapItems hasCoordinates filter.",
    }),
    check(opportunitiesToMapItems([baseOpportunity()]).length === 1, {
      scenario: "A real, on-site opportunity with coordinates does produce a pin",
      agent, category: "location-safety", severity: "LOW",
      expected: "1 pin", actualIfFail: "0 pins (over-filtering — real listings would go missing from the map)",
      evidence: "opportunitiesToMapItems([{lat:42.8864,lng:-78.8784}])",
      suggestedNextAction: "Review hasCoordinates / the filter predicate for an overly strict condition.",
    }),
    check(organizationsToMapItems([baseOrganization({ location_visibility: "hidden" })]).length === 0, {
      scenario: "A 'hidden' organization never produces a pin, even with real coordinates set",
      agent, category: "location-privacy", severity: "HIGH",
      expected: "0 pins", actualIfFail: "1+ pins (private/home location exposed)",
      evidence: 'organizationsToMapItems([{location_visibility:"hidden", lat:..., lng:...}])',
      suggestedNextAction: "STOP — this could expose a home address. Review lib/map-selectors.ts's organizationsToMapItems visibility filter.",
    }),
    check(organizationsToMapItems([baseOrganization({ location_visibility: "approximate", lat: 42.88641234, lng: -78.87841234 })])[0]?.latitude === 42.89, {
      scenario: "An 'approximate' organization shows rounded, not exact, coordinates",
      agent, category: "location-privacy", severity: "MEDIUM",
      expected: "rounded to 2 decimal places", actualIfFail: "exact coordinates leaked",
      evidence: 'organizationsToMapItems([{location_visibility:"approximate", lat:42.88641234,...}])',
      suggestedNextAction: "Review the approximate-rounding branch in lib/map-selectors.ts's organizationsToMapItems.",
    }),
    check(organizationsToMapItems([baseOrganization({ location_visibility: "exact" })])[0]?.href === "/o/org-1", {
      scenario: "A business pin links to the public organization page, not /discover",
      agent, category: "map-integration", severity: "LOW",
      expected: "/o/org-1", actualIfFail: "a different or missing route",
      evidence: 'organizationsToMapItems([...])[0].href',
      suggestedNextAction: "Review the href in lib/map-selectors.ts's organizationsToMapItems.",
    }),
  ];
}

// ── Core Flow Agent ─────────────────────────────────────────────────────
//
// Phase 1 honesty note: this is NOT yet real route/browser smoke-testing
// (that needs Playwright against a running app — deferred, see
// tests/README.md). Today it runs one representative scenario from each
// other pure module as a fast cross-cutting sanity check. Expand this once
// Playwright lands rather than pretending route coverage exists now.

function runCoreFlowAgent(): TestResult[] {
  const agent = "Core Flow Agent";
  return [
    check(isSafeInternalPath("/business/team") === true, {
      scenario: "Core sanity: internal navigation paths resolve as safe",
      agent, category: "core-sanity", severity: "INFO",
      expected: "accepted", actualIfFail: "rejected",
      evidence: 'isSafeInternalPath("/business/team")',
      suggestedNextAction: "Investigate lib/redirect-safety.ts.",
    }),
    check(canAttributeToOrganization(ORG_A, ORG_A) === true, {
      scenario: "Core sanity: a business owner can still post to their own organization",
      agent, category: "core-sanity", severity: "INFO",
      expected: "allowed", actualIfFail: "blocked",
      evidence: "canAttributeToOrganization(ORG_A, ORG_A)",
      suggestedNextAction: "Investigate lib/authz.ts.",
    }),
    check(opportunitiesToMapItems([baseOpportunity()]).length === 1, {
      scenario: "Core sanity: the live map still renders a real, valid listing",
      agent, category: "core-sanity", severity: "INFO",
      expected: "1 pin", actualIfFail: "0 pins",
      evidence: "opportunitiesToMapItems([valid fixture])",
      suggestedNextAction: "Investigate lib/map-selectors.ts.",
    }),
  ];
}

// ── Regression Agent ─────────────────────────────────────────────────────
//
// Known historical bugs, re-asserted under their own name so a founder
// scanning results sees *why* each check exists, not just that it passed.

function runRegressionAgent(): TestResult[] {
  const agent = "Regression Agent";
  return [
    check(canAttributeToOrganization(ORG_A, ORG_B) === false, {
      scenario: "Known historical bug — FLOW-SEC-001 (cross-organization listing attribution) must never silently return",
      agent, category: "known-regression", severity: "HIGH",
      expected: "DENY", actualIfFail: "PASS (regression)",
      evidence: "canAttributeToOrganization(ORG_A, ORG_B)",
      suggestedNextAction: "STOP — FLOW-SEC-001 has regressed. See tests/security/flow-sec-001.test.ts and supabase/migrations/20260820134812_organization_attribution_authorization.sql.",
    }),
    check(opportunitiesToMapItems([baseOpportunity({ lat: null, lng: null })]).length === 0, {
      scenario: "Known historical bug — Map V2 city-center fallback (opportunities/events used to default to CITY_CENTER instead of rendering no pin) must never silently return",
      agent, category: "known-regression", severity: "MEDIUM",
      expected: "0 pins", actualIfFail: "1+ pins (fallback regressed)",
      evidence: "opportunitiesToMapItems([{lat:null,lng:null}])",
      suggestedNextAction: "Review lib/data/opportunities.ts's toCardShape and lib/map-selectors.ts's hasCoordinates filter.",
    }),
  ];
}

export const TEST_LAB_AGENTS: TestLabAgent[] = [
  { id: "core-flow", name: "Core Flow Agent", description: "Fast cross-cutting sanity check (full route/browser checks deferred to a future Playwright phase).", safety: "SAFE_PRODUCTION", run: runCoreFlowAgent },
  { id: "security", name: "Security Agent", description: "FLOW-SEC-001 and open-redirect authorization regression scenarios.", safety: "SAFE_PRODUCTION", run: runSecurityAgent },
  { id: "employer", name: "Employer Agent", description: "Organization/team access — owner protection, self-protection, role restrictions.", safety: "SAFE_PRODUCTION", run: runEmployerAgent },
  { id: "map", name: "Map Agent", description: "Map selector location-safety — coordinates are never fabricated.", safety: "SAFE_PRODUCTION", run: runMapAgent },
  { id: "regression", name: "Regression Agent", description: "Known historical bugs, re-asserted so they can never silently come back.", safety: "SAFE_PRODUCTION", run: runRegressionAgent },
];

export function getAgent(id: TestLabAgent["id"]): TestLabAgent {
  const agent = TEST_LAB_AGENTS.find((a) => a.id === id);
  if (!agent) throw new Error(`Unknown Test Lab agent: ${id}`);
  return agent;
}
