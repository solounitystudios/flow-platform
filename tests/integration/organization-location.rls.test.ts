// Organization Location Foundation — RLS/view-level regression matrix
// (STAGING_ONLY). Same reasoning as tests/integration/flow-sec-001.rls.test.ts
// — see that file's header for the full explanation of why this repo has no
// staging Supabase project to run these against yet, and why that's an
// honest, documented gap rather than a silently-missing one.
//
// tests/unit/map-selectors.test.ts's "organizationsToMapItems:
// location_visibility privacy" describe block already covers the
// TypeScript-side half (the pure selector) with zero external dependencies
// — that's part of the required baseline. This file is the other half:
// proving supabase/migrations/20260820163442_organization_location_privacy.sql's
// `organizations_public` view and `orgs_owner_manage` RLS policy actually
// enforce the same rules at the database level, for an unauthenticated/
// unrelated caller directly querying Supabase (bypassing this app's
// selectors and Server Actions entirely).
import { describe, it } from "vitest";

describe.todo("Organization location privacy — RLS/view matrix (STAGING_ONLY, needs a staging Supabase project)", () => {
  it.todo("organizations_public view: 'hidden' organization returns null lat/lng to an anonymous caller");
  it.todo("organizations_public view: 'remote' organization returns null lat/lng to an anonymous caller");
  it.todo("organizations_public view: 'approximate' organization returns rounded (not exact) lat/lng to an anonymous caller");
  it.todo("organizations_public view: 'exact' organization returns the real lat/lng to an anonymous caller");
  it.todo("raw organizations table: an unrelated authenticated user cannot update another organization's location_visibility (orgs_owner_manage RLS)");
  it.todo("raw organizations table: the owner can update their own organization's location_visibility");
  it.todo("raw organizations table: an owner-authenticated read still sees the real, unredacted lat/lng regardless of location_visibility (settings/editing context)");
});
