import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mockPeople, mockOrganizations } from "@/lib/mock/data";
import { dicebearAvatar } from "@/lib/utils";
import { isDemoModeEnabled } from "@/lib/demo";
import type { MockOrganization, MockPerson, OrganizationLocationVisibility } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

export type DiscoverPerson = Pick<MockPerson, "id" | "username" | "full_name" | "avatar_url" | "city" | "state" | "bio" | "reliability_score" | "available_now">;

function toPersonCard(row: Tables<"profiles">): DiscoverPerson {
  return {
    id: row.id,
    username: row.username ?? row.id.slice(0, 8),
    full_name: row.full_name ?? "FLOW Member",
    avatar_url: row.avatar_url ?? dicebearAvatar(row.username ?? row.id),
    city: row.city,
    state: row.state,
    bio: row.bio ?? "",
    reliability_score: row.reliability_score,
    available_now: row.available_now,
  };
}

/** Real members with a public passport and a claimed username — no mock content
 * mixed in, since callers (e.g. connection requests) need real, connectable profiles. */
export async function getRealDiscoverPeople(excludeId?: string): Promise<DiscoverPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("public_passport", true)
    .not("username", "is", null)
    .order("reliability_score", { ascending: false });

  return (data ?? []).filter((p) => p.id !== excludeId).map(toPersonCard);
}

/** Real members. When NEXT_PUBLIC_FLOW_DEMO_MODE is enabled, supplemented with
 * demo profiles so discovery never looks empty before the platform has real
 * supply — off (the default) returns real members only. */
export async function getDiscoverPeople(excludeId?: string): Promise<DiscoverPerson[]> {
  const real = await getRealDiscoverPeople(excludeId);
  if (!isDemoModeEnabled()) return real;
  return [...real, ...mockPeople];
}

// ─────────────────────────────────────────────────────────────────────────
// organizations_public — TEMPORARY CAST NOTICE
//
// This view is defined in
// supabase/migrations/20260820163442_organization_location_privacy.sql,
// drafted by this batch but NOT YET APPLIED to production — waiting on
// separate founder authorization (see that migration's own header).
// Because of that, lib/database.types.ts (regenerated only from a live
// schema) has no knowledge of it yet, so `supabase.from("organizations_public")`
// fails to typecheck against the real `Database` type.
//
// `pendingOrganizationsPublicView()` is the same escape hatch already used
// for `organization_members` before its migration was applied (see
// lib/data/organization.ts's `pendingOrgMembersTable` for the sibling of
// this exact situation) — re-casts the already-authenticated client to the
// untyped `SupabaseClient` shape just for this one view, narrowed at the
// call site with an explicit cast.
//
// Once the migration is applied and lib/database.types.ts is regenerated:
// delete this helper and the manual `PublicOrganizationRow` type below,
// replace with `Tables<"organizations_public">`, and call
// `supabase.from("organizations_public")` directly.
function pendingOrganizationsPublicView(supabase: Awaited<ReturnType<typeof createClient>>) {
  const untyped = supabase as unknown as SupabaseClient;
  return untyped.from("organizations_public");
}

interface PublicOrganizationRow {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  state: string | null;
  org_type: string;
  verified: boolean;
  created_at: string;
  location_visibility: OrganizationLocationVisibility;
  lat: number | null;
  lng: number | null;
}

function toOrgCard(row: PublicOrganizationRow): MockOrganization {
  return {
    id: row.id,
    name: row.name,
    logo_url: dicebearAvatar(row.name),
    city: row.city ?? "Buffalo",
    state: row.state ?? "NY",
    description: row.description ?? "",
    verified: row.verified,
    industry: row.org_type ? row.org_type.charAt(0).toUpperCase() + row.org_type.slice(1) : "Business",
    member_perk: null,
    rating: null,
    // Already redacted by organizations_public per location_visibility —
    // never fabricated, and never more precise than the org itself chose
    // to share.
    lat: row.lat,
    lng: row.lng,
    location_visibility: row.location_visibility,
  };
}

export async function getDiscoverOrganizations(): Promise<MockOrganization[]> {
  const supabase = await createClient();
  const view = pendingOrganizationsPublicView(supabase);
  const { data } = await view.select("*").order("created_at", { ascending: false });

  const real = ((data ?? []) as unknown as PublicOrganizationRow[]).map(toOrgCard);
  if (!isDemoModeEnabled()) return real;
  return [...real, ...mockOrganizations];
}

/** Single organization for the public organization page (app/o/[id]) —
 * same redaction as getDiscoverOrganizations, single row. Falls back to
 * demo-mode mock organizations by id so /o/[id] works for demo fixtures
 * too, same convention as getFullProfileByUsername's mock fallback. */
export async function getPublicOrganization(id: string): Promise<MockOrganization | null> {
  const supabase = await createClient();
  const view = pendingOrganizationsPublicView(supabase);
  const { data } = await view.select("*").eq("id", id).maybeSingle();
  if (data) return toOrgCard(data as unknown as PublicOrganizationRow);

  if (!isDemoModeEnabled()) return null;
  return mockOrganizations.find((o) => o.id === id) ?? null;
}

// Map V2 pin contract + selectors moved to lib/map-selectors.ts (pure,
// dependency-free — see tests/unit/map-selectors.test.ts) — re-exported here
// so existing call sites (app/(app)/live/page.tsx,
// components/opportunities/LiveBrowser.tsx) don't need to change their
// import path.
export type { MapItemType, MapItem } from "@/lib/map-selectors";
export { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems } from "@/lib/map-selectors";
