import { createClient } from "@/lib/supabase/server";
import { mockPeople, mockOrganizations } from "@/lib/mock/data";
import { dicebearAvatar } from "@/lib/utils";
import { isDemoModeEnabled } from "@/lib/demo";
import type { MockEvent, MockOpportunity, MockOrganization, MockPerson } from "@/lib/types";
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

function toOrgCard(row: Tables<"organizations">): MockOrganization {
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
  };
}

export async function getDiscoverOrganizations(): Promise<MockOrganization[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });

  const real = (data ?? []).map(toOrgCard);
  if (!isDemoModeEnabled()) return real;
  return [...real, ...mockOrganizations];
}

// ---------------------------------------------------------------------------
// Map V2 — normalized pin contract
//
// A single shape any pinnable item (opportunity, event, business, ...) can be
// reduced to so components/opportunities/LiveMap.tsx never has to know the
// source table's shape. Selectors below are pure — they take data already
// fetched through the owning agent's `lib/data/*.ts` query functions
// (getOpenOpportunities, getUpcomingEvents) rather than querying
// `opportunities`/`events` directly, per this repo's ownership rules.
// ---------------------------------------------------------------------------

/**
 * "work_now" is derived from the same `urgent` flag opportunities.ts already
 * computes (on-site + starts within 6h) — there is no dedicated
 * `is_work_now` column/flag yet. "community" is derived from
 * `opportunity_type === "volunteer"`, the closest existing real category to
 * "community opportunities" (there is no separate community-opportunities
 * table or type in the schema). An urgent volunteer opportunity is bucketed
 * under "work_now", not "community" — time-sensitivity wins.
 */
export type MapItemType = "opportunity" | "work_now" | "event" | "business" | "community";

export interface MapItem {
  id: string;
  type: MapItemType;
  title: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  urgency?: "urgent" | null;
  verified?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  href: string;
}

function hasCoordinates(lat: number | null | undefined, lng: number | null | undefined): lat is number {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng);
}

/**
 * Converts already-fetched open opportunities (the shape returned by
 * lib/data/opportunities.ts's getOpenOpportunities) into map pins.
 *
 * lib/data/opportunities.ts's toCardShape passes lat/lng through as-is
 * (nullable) rather than coalescing missing coordinates to a city-center
 * fallback, so `hasCoordinates` below is a real location check, not a
 * heuristic. Remote opportunities are additionally excluded outright —
 * pinning a remote listing to any single point would fabricate a location
 * on the map.
 */
export function opportunitiesToMapItems(opportunities: MockOpportunity[]): MapItem[] {
  return opportunities
    .filter(
      (o): o is MockOpportunity & { lat: number; lng: number } =>
        !o.is_remote && hasCoordinates(o.lat, o.lng)
    )
    .map((o) => ({
      id: o.id,
      type: o.urgent ? "work_now" : o.opportunity_type === "volunteer" ? "community" : "opportunity",
      title: o.title,
      latitude: o.lat,
      longitude: o.lng,
      city: o.city,
      state: o.state,
      status: o.status,
      urgency: o.urgent ? "urgent" : null,
      verified: o.organization.verified,
      starts_at: o.starts_at,
      expires_at: o.ends_at,
      href: `/gigs/${o.id}`,
    }));
}

/**
 * Converts already-fetched published events (the shape returned by
 * lib/data/events.ts's getUpcomingEvents/getPastEvents) into map pins.
 * lib/data/events.ts's toCardShape passes lat/lng through as-is (nullable)
 * rather than coalescing missing coordinates to a city-center fallback, so
 * `hasCoordinates` below is a real location check, not a heuristic.
 */
export function eventsToMapItems(events: MockEvent[]): MapItem[] {
  return events
    .filter(
      (e): e is MockEvent & { lat: number; lng: number } => hasCoordinates(e.lat, e.lng)
    )
    .map((e) => ({
      id: e.id,
      type: "event" as const,
      title: e.title,
      latitude: e.lat,
      longitude: e.lng,
      city: e.city,
      state: e.state,
      status: e.status,
      urgency: null,
      verified: e.organization?.verified ?? false,
      starts_at: e.starts_at,
      expires_at: e.ends_at,
      href: `/events/${e.id}`,
    }));
}

/**
 * Businesses layer — deferred by design. `organizations` has no lat/lng
 * columns (confirmed against lib/database.types.ts); schema-auditor is
 * auditing whether/how to add them in parallel with this batch. Do not
 * fabricate coordinates for businesses. Once that schema change lands and
 * lib/data/discover.ts's getDiscoverOrganizations (or a follow-up export)
 * exposes real lat/lng, wire this up the same way as the selectors above —
 * LiveMap.tsx already renders a "coming soon" empty state for this layer in
 * the meantime rather than guessing at a location.
 */
export function getBusinessMapItems(): MapItem[] {
  return [];
}
