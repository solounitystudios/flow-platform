// Map V2 — normalized pin contract.
//
// A single shape any pinnable item (opportunity, event, business, ...) can be
// reduced to so components/opportunities/LiveMap.tsx never has to know the
// source table's shape. Every selector below is pure and dependency-free (no
// Next.js/Supabase imports) — they take data already fetched through the
// owning agent's `lib/data/*.ts` query functions (getOpenOpportunities,
// getUpcomingEvents, getDiscoverOrganizations) rather than querying
// `opportunities`/`events`/`organizations` directly, per this repo's
// ownership rules. Kept dependency-free deliberately so this file is safe to
// unit test in isolation — see tests/unit/map-selectors.test.ts.
import type { MockEvent, MockOpportunity, MockOrganization } from "@/lib/types";

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

export function hasCoordinates(lat: number | null | undefined, lng: number | null | undefined): lat is number {
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
 * Converts already-fetched organizations (the shape returned by
 * getDiscoverOrganizations) into map pins. `organizations.lat/lng` are plain
 * nullable columns with no backfill/geocoding step yet, so most orgs will
 * have none — those are filtered out by `hasCoordinates` rather than
 * fabricated, same as the opportunity/event selectors. It's expected and
 * acceptable for this to return `[]` until organizations actually have
 * coordinates set.
 *
 * Location privacy: only 'exact' and 'approximate' organizations can ever
 * produce a pin — 'hidden' and 'remote' never do, regardless of whether
 * lat/lng happen to be set. This selector re-enforces that rule itself
 * (not just trusting the caller already redacted it) because it also runs
 * against lib/mock/data.ts's demo-mode fixtures, which never go through
 * the organizations_public view that redacts real Supabase rows — this is
 * the one place both real and mock data are guaranteed to pass through the
 * same check. 'approximate' rounds to 2 decimal places (~1.1km of fuzz) —
 * matching supabase/migrations/20260820163442_organization_location_privacy.sql's
 * own rounding, so a real row already redacted by that view and a mock row
 * redacted here end up with the same precision either way.
 */
export function organizationsToMapItems(organizations: MockOrganization[]): MapItem[] {
  return organizations
    .filter((o) => o.location_visibility === "exact" || o.location_visibility === "approximate")
    .filter((o): o is MockOrganization & { lat: number; lng: number } => hasCoordinates(o.lat, o.lng))
    .map((o) => ({
      id: o.id,
      type: "business" as const,
      title: o.name,
      latitude: o.location_visibility === "approximate" ? Math.round(o.lat * 100) / 100 : o.lat,
      longitude: o.location_visibility === "approximate" ? Math.round(o.lng * 100) / 100 : o.lng,
      city: o.city,
      state: o.state,
      status: null,
      urgency: null,
      verified: o.verified,
      starts_at: null,
      expires_at: null,
      href: `/o/${o.id}`,
    }));
}
