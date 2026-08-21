// Map V2 — canonical layer model + normalized pin contract.
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
//
// This is also the SINGLE source of truth for FLOW's layer/category rules —
// components/opportunities/LiveMap.tsx (map pins) and
// components/opportunities/LiveBrowser.tsx (result cards) both filter
// through the same functions here, so the map can never show one thing
// while the results list shows another. Do not reimplement any of this
// bucketing logic inside a component.
import type { MockEvent, MockOpportunity, MockOrganization, OpportunityType } from "@/lib/types";

/**
 * The underlying kind of thing a pin represents — independent of whether
 * it currently also satisfies Work Now. A job that starts in the next 6
 * hours is still entityType "job"; it does not stop being a job just
 * because it's also urgent. This is deliberately a *different axis* from
 * `isWorkNow` on `MapItem` below, so nothing has to choose between "this is
 * a job" and "this is Work Now" — both stay true when both are true, and
 * the underlying opportunity is represented exactly once either way, never
 * duplicated into a second pin/card.
 */
export type MapEntityType = "gig" | "job" | "volunteer" | "event" | "business";

/**
 * The canonical, user-facing Map V2 category. Exactly one of these is
 * selected at a time (single-select — "All" only makes sense as a member
 * of this set if the rest are mutually exclusive with it). This is the ONE
 * type components/opportunities/LiveBrowser.tsx owns as state and passes
 * into both the map and the results list — see mapItemMatchesLayer and the
 * filterXForLayer functions below, which are how that single piece of
 * state actually determines what's visible.
 */
export type MapLayer = "all" | "work_now" | MapEntityType;

export const MAP_LAYERS: MapLayer[] = ["all", "work_now", "gig", "job", "volunteer", "event", "business"];

export const MAP_LAYER_LABEL: Record<MapLayer, string> = {
  all: "All",
  work_now: "Work Now",
  gig: "Gigs",
  job: "Jobs",
  volunteer: "Volunteer",
  event: "Events",
  business: "Businesses",
};

/**
 * Layer-accurate empty-state copy — never implies "nothing exists in
 * Buffalo" when the real reason is a narrower filter, a missing
 * coordinate, or a business that hasn't opted into public location
 * sharing. Shared between the map (no pins) and the results list (no
 * cards) so the two surfaces never contradict each other about *why*
 * something looks empty.
 */
export const MAP_LAYER_EMPTY_COPY: Record<MapLayer, string> = {
  all: "Nothing live nearby yet. Check back soon, or try a different category.",
  work_now: "No Work Now opportunities nearby right now — those are on-site listings starting within the next few hours.",
  gig: "No gigs available right now.",
  job: "No jobs available right now.",
  volunteer: "No volunteer opportunities available right now.",
  event: "No upcoming events with a mappable location right now.",
  business: "No businesses sharing a public location yet.",
};

/**
 * Single source of truth for "which of the three opportunity layers does
 * this row belong to" — the exact rule components/opportunities/LiveBrowser.tsx's
 * old standalone filter already used (a "project" buckets under Gigs), now
 * shared instead of duplicated. Not affected by urgency — see MapEntityType's
 * doc comment above for why that's a separate axis.
 */
export function opportunityEntityType(o: Pick<MockOpportunity, "opportunity_type">): "gig" | "job" | "volunteer" {
  if (o.opportunity_type === "job") return "job";
  if (o.opportunity_type === "volunteer") return "volunteer";
  return "gig"; // "gig" or "project"
}

export interface MapItem {
  id: string;
  entityType: MapEntityType;
  /** True when this opportunity currently satisfies Work Now semantics
   * (on-site, starts within 6h — computed by lib/data/opportunities.ts's
   * `urgent` field). Always false for events/businesses — Work Now is an
   * opportunity-only concept. */
  isWorkNow: boolean;
  title: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  verified?: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  href: string;

  // ── Detail-sheet enrichment ──────────────────────────────────────────
  // Additive, optional, populated only for the entity kinds they apply to.
  // Every value here is copied straight from the already-fetched
  // opportunity/event/organization row — never derived or guessed — so a
  // missing value renders as "not shown", never a fabricated placeholder.

  /** Organization/host name. Opportunities and events only — a business
   * pin's `title` already IS the organization name, so this stays unset
   * for entityType "business" rather than duplicating it. */
  organizationName?: string | null;

  /** Opportunities only — the raw underlying type (job/gig/project/
   * volunteer), kept separate from `entityType` because `entityType`
   * buckets "project" under "gig" for layer purposes; this preserves the
   * exact label for the detail sheet. */
  opportunityType?: OpportunityType | null;
  /** Opportunities only, cents/hour — null means unpaid/volunteer. */
  payCents?: number | null;
  /** Opportunities only. */
  slots?: number | null;
  slotsFilled?: number | null;

  /** Events only. */
  capacity?: number | null;
  registered?: number | null;

  /** Businesses only. */
  industry?: string | null;
  memberPerk?: string | null;
}

/**
 * Does this map item belong to the given canonical layer? The one rule
 * both the map and the results list filter through (see the filterXForLayer
 * functions below for the equivalent on raw, not-yet-map-item-shaped
 * entities). "all" is a strict superset — every eligible item passes
 * regardless of entityType/isWorkNow, and since a MapItem represents its
 * underlying opportunity/event/organization exactly once, "all" can never
 * double-count an urgent gig as two pins.
 */
export function mapItemMatchesLayer(item: Pick<MapItem, "entityType" | "isWorkNow">, layer: MapLayer): boolean {
  if (layer === "all") return true;
  if (layer === "work_now") return item.isWorkNow;
  return item.entityType === layer;
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
      entityType: opportunityEntityType(o),
      isWorkNow: o.urgent,
      title: o.title,
      latitude: o.lat,
      longitude: o.lng,
      city: o.city,
      state: o.state,
      status: o.status,
      verified: o.organization.verified,
      starts_at: o.starts_at,
      expires_at: o.ends_at,
      href: `/gigs/${o.id}`,
      organizationName: o.organization.name,
      opportunityType: o.opportunity_type,
      payCents: o.pay_cents,
      slots: o.slots,
      slotsFilled: o.slots_filled,
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
      entityType: "event" as const,
      isWorkNow: false,
      title: e.title,
      latitude: e.lat,
      longitude: e.lng,
      city: e.city,
      state: e.state,
      status: e.status,
      verified: e.organization?.verified ?? false,
      starts_at: e.starts_at,
      expires_at: e.ends_at,
      href: `/events/${e.id}`,
      organizationName: e.organization?.name ?? null,
      capacity: e.capacity,
      registered: e.registered,
    }));
}

/** Is this organization's location_visibility eligible for any public
 * surface at all (map or list)? 'hidden'/'remote' never are. */
export function isPublicMapEligible(o: Pick<MockOrganization, "location_visibility">): boolean {
  return o.location_visibility === "exact" || o.location_visibility === "approximate";
}

/**
 * The single point (if any) an organization is ever allowed to render at —
 * shared by organizationsToMapItems (below) and Batch 3's viewport bounds
 * filter (lib/map-viewport.ts's filterOrganizationsByBounds) so both paths
 * apply the exact same privacy rule instead of two copies that could drift.
 * Returns null for 'hidden'/'remote' or a coordinate-less organization —
 * never a fabricated point. 'approximate' rounds to 2 decimal places
 * (~1.1km of fuzz), matching
 * supabase/migrations/20260820163442_organization_location_privacy.sql's
 * own rounding, so a real row already redacted by that view and a mock row
 * redacted here end up with the same precision either way.
 */
export function effectiveOrganizationCoordinates(
  o: Pick<MockOrganization, "lat" | "lng" | "location_visibility">,
): { lat: number; lng: number } | null {
  if (!isPublicMapEligible(o)) return null;
  // hasCoordinates only narrows its first argument's type (lat), so the
  // explicit `o.lng === null` re-check below is purely for TypeScript's
  // control-flow narrowing on the second field — hasCoordinates already
  // guarantees both are finite numbers at runtime.
  if (!hasCoordinates(o.lat, o.lng) || o.lng === null) return null;
  return o.location_visibility === "approximate"
    ? { lat: Math.round(o.lat * 100) / 100, lng: Math.round(o.lng * 100) / 100 }
    : { lat: o.lat, lng: o.lng };
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
 * same check (via effectiveOrganizationCoordinates above).
 */
export function organizationsToMapItems(organizations: MockOrganization[]): MapItem[] {
  return organizations
    .map((o) => ({ o, coords: effectiveOrganizationCoordinates(o) }))
    .filter((x): x is { o: MockOrganization; coords: { lat: number; lng: number } } => x.coords !== null)
    .map(({ o, coords }) => ({
      id: o.id,
      entityType: "business" as const,
      isWorkNow: false,
      title: o.name,
      latitude: coords.lat,
      longitude: coords.lng,
      city: o.city,
      state: o.state,
      status: null,
      verified: o.verified,
      starts_at: null,
      expires_at: null,
      // No public per-organization detail page exists yet (organizations
      // aren't individually linkable anywhere else in the app either —
      // see components/social/OrganizationCard.tsx) — route to the
      // existing organizations browse surface rather than fabricating a
      // route.
      href: `/o/${o.id}`,
      industry: o.industry,
      memberPerk: o.member_perk,
    }));
}

// ── Result-list filtering ────────────────────────────────────────────────
//
// The map-item selectors above additionally require real coordinates
// (a pin needs a point to render at). The results list has never had that
// requirement — it's the "see everything matching this category,
// mappable or not" view, which is why a separate List/Map toggle exists at
// all — so these operate on the raw, not-yet-map-item-shaped entities and
// deliberately do NOT filter on hasCoordinates. They DO apply the same
// category rule as mapItemMatchesLayer, and for organizations, the same
// location_visibility privacy gate as organizationsToMapItems — a
// hidden/remote org must never appear in the results list either, pin or
// no pin.

export function filterOpportunitiesForLayer(opportunities: MockOpportunity[], layer: MapLayer): MockOpportunity[] {
  return opportunities.filter((o) => {
    if (layer === "all") return true;
    if (layer === "work_now") return o.urgent;
    if (layer === "event" || layer === "business") return false;
    return opportunityEntityType(o) === layer;
  });
}

export function filterEventsForLayer(events: MockEvent[], layer: MapLayer): MockEvent[] {
  return layer === "all" || layer === "event" ? events : [];
}

export function filterOrganizationsForLayer(organizations: MockOrganization[], layer: MapLayer): MockOrganization[] {
  if (layer !== "all" && layer !== "business") return [];
  return organizations.filter(isPublicMapEligible);
}
