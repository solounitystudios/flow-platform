# FLOW Map V2 — Plan

Written from the readiness audit on `feature/map-v2-readiness` (baseline: `main` @ `b8f9d34`). This document is the source of truth for what Map V2 needs; update it as batches land rather than letting it drift.

## Objective

> Open FLOW → location-aware map → choose what kinds of things to see → discover nearby opportunities/events/businesses → tap a pin → understand what it is immediately → apply/register/open detail → return to the map without losing context.

The map's purpose is narrow and specific: **show people actionable opportunities, events, and organizations around them.** Every change below should serve `See → Understand → Act → Complete → Record outcome on Passport`, not passive browsing.

## Current Implementation

- **Route**: `/live` (`app/(app)/live/page.tsx`) — the only map entry point. Fetches `getOpenOpportunities()`, `getUpcomingEvents()`, `getDiscoverOrganizations()` server-side, converts each through `lib/map-selectors.ts`, passes the combined `MapItem[]` into `LiveBrowser`.
- **Map library**: `react-map-gl@^7.1.9` over `maplibre-gl@^4.7.1`. Free OpenFreeMap vector tiles by default (`NEXT_PUBLIC_MAP_STYLE_URL` overridable) — no API key, no rate limit, no SLA (documented as dev-appropriate, production should point at a provider with an SLA).
- **`components/opportunities/LiveMap.tsx`**: the actual map. Per-layer-type GeoJSON `Source` + clustered `Layer`s (`clusterMaxZoom: 14`, `clusterRadius: 50`, click-to-zoom on cluster expansion), a `ChipToggleGroup` for layer visibility, loading/error/empty states, one-shot best-effort geolocation (non-blocking, never persisted), pin click → `DetailSheet`.
- **`components/opportunities/LiveBrowser.tsx`**: wraps `LiveMap` plus a map/list view toggle and **a second, separate** filter bar (`All/Gigs/Jobs/Volunteer/Events`) that drives the list of `OpportunityCard`/`EventCard`s below.
- **`lib/map-selectors.ts`**: pure, dependency-free selectors — `opportunitiesToMapItems`, `eventsToMapItems`, `organizationsToMapItems`. Unit tested (`tests/unit/map-selectors.test.ts`).
- **`/o/[id]`**: public organization page, reads from `organizations_public` (the location-privacy view), lists that org's open opportunities/events.
- **Business location privacy**: `organizations.location_visibility` (`exact`/`approximate`/`hidden`/`remote`), enforced by the `organizations_public` view (redaction) and re-enforced in `organizationsToMapItems` (so demo-mode mock data gets the identical rule). Owner control lives on `/business` (`LocationVisibilityControl`).

## Reusable Infrastructure

Everything below is solid and should be **extended, not replaced**:

- **Clustering** — generic per-layer-type, zoom-sensitive, already handles mixed pin density reasonably. No reason to touch the clustering mechanism itself for Map V2.
- **`ChipToggleGroup`** — generic multi-select toggle-chip component, not map-specific. This is the right primitive for the 7-item layer model; no new filter UI component is needed.
- **`DetailSheet`** — already supports everything Map V2's detail interaction needs: bottom sheet on mobile (swipe-to-dismiss, safe-area-inset-bottom aware), floating card on desktop, focus trap, Escape-to-close, `role="dialog"`, and **both a primary and a secondary action slot already exist in the component API** — the current gap is that `LiveMap.tsx` only wires one (`action: "View details"`), not that the component can't support "Apply" + "View" together.
- **`opportunitiesToMapItems` / `eventsToMapItems` / `organizationsToMapItems`** — the selector contract (pure functions, `MapItem` normalized shape, never-fabricate-a-location, privacy-aware) is correct and should be extended in place, not forked.
- **`OpportunityCard` / `EventCard` / `OrganizationCard`** — already compute and format everything the richer detail sheet needs (pay/hr formatting, spots-left, type label, relative time). Reuse this formatting logic rather than re-deriving it for the map.
- **Geolocation posture** — the current one-shot, non-blocking, never-persisted `getCurrentPosition` call already matches the desired privacy model almost exactly. Extend it (e.g. for radius search), don't replace it.

## Layer Contract

The requested flat model — **All / Work Now / Gigs / Jobs / Volunteer / Events / Businesses** — does **not** exist today in this exact shape. Current reality:

| Requested layer | Current source | Current map-layer reality |
|---|---|---|
| All | — | Implicit (default: every layer active); no explicit "select all" affordance |
| Work Now | `opportunities` where `urgent` (on-site + starts <6h, **computed on read, not stored**) | Already its own map layer (`work_now`) |
| Gigs | `opportunities` where `opportunity_type IN ('gig','project')` | **Not separated at the map layer** — lumped into a generic `"opportunity"` bucket labeled "Jobs" |
| Jobs | `opportunities` where `opportunity_type = 'job'` | Same bucket as Gigs today — no map-layer distinction |
| Volunteer | `opportunities` where `opportunity_type = 'volunteer'` | Exists as a map layer, but named/typed `"community"` — a naming mismatch, not a missing feature |
| Events | `events` where `status = 'published'` | Matches 1:1 already |
| Businesses | `organizations_public` where `location_visibility IN ('exact','approximate')` | Matches 1:1 already |

**The list filter in `LiveBrowser` already separates Gigs/Jobs/Volunteer** (for the card list) but doesn't touch the map's layer toggles, and doesn't offer Work Now or Businesses as filter options. This is two overlapping, inconsistent filter systems layered on one screen — not a missing feature, a **reconciliation problem**. Map V2 should have exactly one layer/filter model driving both the map and the list, not two.

## Privacy Contract

Verified live against production (see prior session's `20260820163442_organization_location_privacy` migration audit) and via unit tests — this contract must hold for every future layer addition:

- Never fabricate a coordinate. A missing `lat`/`lng` renders as no pin, never a city-center guess.
- `organizations.location_visibility`: `hidden` and `remote` never produce a physical pin, regardless of whether coordinates are set. `approximate` rounds to 2 decimal places (~1.1km fuzz). `exact` passes through unrounded. Enforced at the database layer (`organizations_public` view) *and* re-enforced in the TypeScript selector (so demo-mode mock data, which never touches the view, is held to the same rule).
- Public map/list queries only ever read through public-safe sources: `getOpenOpportunities` (status filtered), `getUpcomingEvents` (status filtered), `getDiscoverOrganizations`/`getPublicOrganization` (via `organizations_public`, never the raw `organizations` table for public-facing output).
- `/o/[id]` never exposes team roster, owner identity, or private address — only what `organizations_public` returns.

**Known, already-accepted limitation** (not new, not this batch's problem): the raw `organizations` table remains fully public-read at the RLS level (`orgs_public_read using (true)`) — a direct Supabase REST query bypassing the app could still read raw, unredacted `lat`/`lng`. The privacy boundary today is "which query path the app uses," not a hard DB-level column restriction. Any future public organization query added for Map V2 must go through `organizations_public`, never `organizations` directly.

## Mobile Behavior

- `DetailSheet` is already mobile-correct: bottom sheet, swipe-to-dismiss, safe-area-inset-bottom padding for iOS home indicator, focus trap.
- `ChipToggleGroup` scrolls horizontally on narrow viewports (`no-scrollbar`) — functional, but **touch targets are ~34-36px tall** (`py-1.5` + `text-sm`), below the commonly recommended 44px minimum. Real, concrete finding — not yet a blocker, worth fixing before shipping a 7-chip row (more chips = more mis-taps).
- No dedicated map component tests exist (only pure-selector tests) — mobile layout has not been regression-tested, only reviewed by inspection.

## Detail Interaction

Today: tap pin → `DetailSheet` shows icon, urgency/verified badge, title, layer-label subtitle, city/state, relative start time, and **one action ("View details")** linking away. Missing versus the target model: organization name, compensation, positions-remaining, distance, and a direct "Apply"/"Register" primary action distinct from "View full detail." All of this is a **data + wiring gap**, not a component gap — see Reusable Infrastructure above.

## Map/List Relationship

- Today, the "List" view toggle only hides/shows the map — **the card list below is always rendered regardless of view state**, so "List view" is really just "hide the map," not a true map/list mode switch.
- No pin-selection ↔ card-highlight linkage in either direction.
- No map-bounds-affects-results behavior (not required for the Buffalo-scale MVP — flagging as intentionally out of scope for now, not a gap to close).

## Work Now Relationship

**The current opportunity model already supports Work Now as a filtered view — no new schema, no new table.** `opportunities.urgent` (computed: on-site + starts within 6h of now) is exactly Work Now semantics today, already surfaced as its own map layer. The only real gap is that the **list filter** (`LiveBrowser`'s `FILTERS` array) doesn't expose "Work Now" as a selectable option the way the map layer toggles do — a UI wiring gap, not a data model gap.

## Required Changes (Map V2, smallest coherent version)

1. Extend `MapItemType` in `lib/map-selectors.ts`: split `"opportunity"` into `"gig" | "job"`, rename `"community"` → `"volunteer"`. `"work_now"`/`"event"`/`"business"` stay as-is.
2. Reconcile `LiveBrowser`'s standalone filter bar and `LiveMap`'s `ChipToggleGroup` into one layer/filter model that drives both the map and the list — do not add a third filter system.
3. Extend `MapItem` with the fields the richer detail sheet needs (organization name, `pay_cents`, `slots`/`slots_filled`, `opportunity_type`) — additive fields only, no new selector architecture.
4. Wire `LiveMap`'s `DetailSheet` usage to use its already-existing `secondaryAction` slot for a direct "Apply"/"Register" CTA alongside "View details."
5. Raise `ChipToggleGroup`'s touch target height toward 44px before shipping a 7-chip layer row.

## Deferred Changes (explicitly not this batch, not the next one either)

- Real geocoding/address-entry UI for organizations (still blocked on product decisions about address collection, unrelated to map plumbing).
- Radius search / map-bounds-driven result filtering.
- True user-relative distance (`lib/geo.ts`'s `milesFromCityCenter` is distance-from-a-fixed-city-center constant, not distance-from-the-user's-actual-position — fine for a single-city MVP, would need revisiting for a second city).
- Full Work Now product surface (dedicated UI, notifications, etc.) — the *data model* is ready; the *product experience* is intentionally out of scope per the standing scope lock.
- Any of: Jobs V2, Events V2, Passport V2, payments, nationwide map, live tracking, turn-by-turn — unrelated to this plan.

## Acceptance Criteria (for whichever batch implements Required Changes)

- [x] All 7 layer chips (`All/Work Now/Gigs/Jobs/Volunteer/Events/Businesses`) exist in exactly one place, driving both map and list identically.
- [x] No pin ever appears for a hidden/remote business or a coordinate-less opportunity/event — regression tests must cover this for every layer, not just organizations.
- [x] Tapping a pin shows enough to act on (org, compensation if applicable, timing, positions remaining) without leaving the map, with a direct Apply/Register CTA plus a secondary "view full detail" path.
- [x] `ChipToggleGroup` touch targets meet a real minimum (44px) at the density Map V2 needs.
- [x] `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run tests/unit tests/security` pass (53/53).
- [ ] `npm run build` — locally blocked by Codespace resource exhaustion (exit 143), not by a source-level failure. **GitHub Actions CI is the authoritative build gate for this batch** — see Batch 1 Status below.

## Batch 1 Status — Map V2 foundation

**Implementation: complete.** All five Required Changes above are implemented:
canonical `MapLayer`/`MapEntityType`/`isWorkNow` model (`lib/map-selectors.ts`),
one filter state driving both map and list (`LiveBrowser`), an extended
`MapItem` contract carrying real organization/compensation/capacity/industry
data (additive fields only, no new DB columns, no migration), a richer pin
`DetailSheet` (org, type badge, Work Now/Urgent tag, pay, timing, positions
remaining / attendance, industry, member perk), a "View details"/"View
organization" primary action on every pin plus a "View & Apply"/"View &
Register" secondary nudge to the existing detail page for opportunities and
events (no application/registration logic duplicated inside the map — that
still lives entirely in `ApplyButton`/`RealApplyButton` and their event
equivalents), and 44px chip touch targets.

**Verification: typecheck, lint, and tests are green** — `tsc --noEmit`
clean, `eslint` clean on every changed file, `vitest run tests/unit
tests/security` **53/53 passing** (the 3 stale `map-selectors.test.ts`
assertions were fixed and rewritten against `entityType`/`isWorkNow`, plus
new coverage added — see the test file).

**`npm run build` is locally unverified — not locally falsified.** The
Codespace environment was under sustained memory/CPU pressure across every
attempt made while finishing this batch (`free -h` repeatedly showed
6.3–6.4GB/7.8GB used, well under 1GB free, no swap; `nproc`=2; load average
up to ~2.9 — driven by concurrent editor/tsserver processes, not by this
batch's code). Five separate build attempts were made across two sessions,
including two with a 10-minute budget each; every one was killed (exit 143)
before Turbopack finished compiling `.next/server/app`. `tsc --noEmit`,
`eslint`, and `vitest` all completed normally and stayed green throughout
every attempt, and no source code was changed to work around the local
build failures. There is no evidence of a source-level build failure — only
of a resource-starved local sandbox.

Given that, **local `npm run build` is retired as the completion gate for
this batch. GitHub Actions CI (`typecheck, lint, test, build` — see
`.github/workflows/`) is the authoritative build verification** going
forward: it runs in an unconstrained environment and its `build` job result
is what determines whether this acceptance criterion is actually met. This
plan will not mark the build criterion `[x]` until that CI run reports
green on the PR — a local resource failure is not being papered over as a
pass.
