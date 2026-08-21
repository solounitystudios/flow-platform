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
- [x] Tapping a pin shows enough to act on (org, compensation if applicable, timing, positions remaining) without leaving the map, with a direct Apply/Register CTA. (Batch 2 note: this shipped in Batch 1 as a primary CTA plus a same-URL "secondary" nudge; Batch 2 removed the fake second button — see Batch 2 Status.)
- [x] `ChipToggleGroup` touch targets meet a real minimum (44px) at the density Map V2 needs.
- [x] `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/vitest run tests/unit tests/security` pass (53/53).
- [x] `npm run build` — confirmed green via GitHub Actions CI on PR #6 (local Codespace build remained resource-blocked, exit 143, but was never a source-level failure). PR #6 merged to `main` at `abb1b0ebbfca04372b58e749d6fafb55d859e9cf`.

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

**Batch 1 shipped**: PR #6, merged to `main` at commit `abb1b0e` after GitHub
Actions CI reported green (`typecheck, lint, test, build` all `SUCCESS`).

## Batch 2 Status — Rich Pin Detail + Direct Action Polish

Scope: interaction and visual-hierarchy polish on the pin `DetailSheet` that
Batch 1 shipped — no new backend systems, no schema changes, no radius
search / geocoding / Search This Area / true user-relative distance (those
remain out of scope, tracked under Batch 3 below).

**Selected-pin emphasis** (`LiveMap.tsx`): the selected pin now renders with
a larger radius (11 vs 8), a thicker white stroke (3px vs 2px), and a soft
outer ring in the pin's own category color (16px radius, 55% stroke
opacity, no fill) — a second, always-on-top GeoJSON source/layer pair keyed
to the single selected feature. Static, no animation. Shape/size-based, not
color-only, so it doesn't rely on color alone to be readable. Clusters are
untouched — this only ever targets one already-selected, non-clustered
point.

**Duplicate same-URL actions removed** (Phase 8 finding from the prior
report): Batch 1's opportunity and event pins each showed two buttons
("View details" + "View & Apply"/"View & Register") that resolved to the
exact same href with no behavioral difference. Confirmed no safe way to
give either a truly distinct action without duplicating
`ApplyButton`/`RealApplyButton` (and their event equivalents) auth/mutation
logic inside the map, so each entity type now shows exactly **one** primary,
full-width CTA: "View & Apply" (opportunities), "View & Register" (events),
"View organization" (businesses, unchanged — was already single).

**Verification badge no longer competes with Urgent**: Batch 1's single
`tag` slot meant an urgent *and* verified opportunity could only show one
badge. The pin sheet's `tag` now holds a small cluster of status badges
(type badge + Urgent, for opportunities) via `DetailSheet`'s `tag` prop
widened to accept multiple badges; organization/business verification moved
inline next to the org name (opportunities) or stays in `tag` where it
never competed with anything (events/businesses, unchanged).

**Priority-ordered, denser-but-bounded metadata**: opportunity meta now
reads compensation → timing → location → positions remaining (matching the
priority order this batch specified), capped at 4 items; events and
businesses were already within the 2–4 item target and are unchanged in
ordering.

**`DetailSheet` primitive** (`components/ui/DetailSheet.tsx`, the map pin
sheet's only current consumer — confirmed via repo-wide grep before
touching a shared primitive): title changed from single-line `truncate` to
`line-clamp-2` so a long opportunity/event title wraps up to two lines
instead of silently clipping; subtitle got the same treatment for long
organization/host names. Both stay bounded (2 lines max) rather than
growing the sheet unbounded, preserving Batch 1's "compact, not a mini
full-page screen" intent. No other primitive behavior changed — mobile
bottom-sheet/swipe-to-dismiss, desktop floating-card positioning, focus
trap, and Escape-to-close are all untouched from Batch 1.

**Map context preservation** (Phase 12): audited, not rebuilt. The selected
`MapLayer` lives in `LiveBrowser`, not `LiveMap`, so selecting/closing a pin
never touches it. `MapGL` is uncontrolled after its initial view state, and
selecting/closing a pin only changes `LiveMap`'s local `selectedId` state —
it does not unmount `MapGL` — so viewport/zoom already survive pin
select/deselect with no code change needed. Navigating away to a full
opportunity/event/organization detail page and back is a real page
navigation with no URL-state persistence today (layer resets to "All",
viewport resets to city-center) — this was true before Batch 2 too, no
"tiny safe improvement" was obvious without adding URL state, so it's
deferred rather than half-built. Flagging for a future batch, not fixing
here.

**Privacy**: unchanged. Business pins still only ever go through
`organizationsToMapItems`'s `location_visibility` gate; no owner id, team
roster, or raw hidden coordinate is exposed anywhere in the sheet.

**Tests**: no new pure logic was extracted from the pin-detail/selected-pin
work itself (the changes are JSX/formatting inside a client component,
matching Batch 1's own convention, and the repo has no component-rendering
test infrastructure — confirmed via `package.json`/`tests/` audit), so no
new test file was added for that part. `lib/map-selectors.ts` was not
touched this batch, so its existing coverage is unchanged. A new test file
*was* added this batch for the unrelated admin-nav fix below
(`tests/unit/admin-nav-serialization.test.ts`), bringing the suite to
**56/56 passing** (`./node_modules/.bin/vitest run tests/unit
tests/security`).

**Runtime repair bundled into this batch (unrelated to pin detail):**
manual preview surfaced a pre-existing admin navigation Server Component
serialization bug on `main` — Lucide icon component references were being
passed as props from the server `AdminNav` into the client `SidebarShell`,
which React cannot serialize across that boundary, producing HTTP 500s on
`/admin` and `/admin/evidence`. Fixed by passing plain string icon keys
(e.g. `"layout-dashboard"`) instead of component references, with
`SidebarShell` resolving keys to Lucide components entirely client-side.
Admin authorization/MFA/AAL2 behavior is unchanged. Covered by the new
`tests/unit/admin-nav-serialization.test.ts` (asserts every nav item
survives a JSON round-trip and `icon` is always a string). This bug
pre-dates Batch 2 and is unrelated to the map/pin-detail work — it's
included in this PR because manual QA exposed it before merge, not because
it's part of the Map V2 plan.

**Not done / explicitly out of scope for Batch 2**: radius search,
"Search This Area", true user-relative distance, geocoding/address
collection, Work Now V2, Events V2, Passport V2, Wallet. None of these were
touched, per the batch's own scope lock.

**Local build**: verified this session — `npm run build` succeeded locally
(37.7s compile), in addition to GitHub CI (`typecheck, lint, test, build`)
reporting green on PR #7. Both the local Codespace resource constraints
noted in Batch 1 and the earlier "not re-verified" note for this batch are
superseded by that successful local run.

## Batch 3 Status — Search This Area + True User-Relative Distance

Scope: the two items Batch 2 explicitly deferred — "Search This Area" /
map-bounds-driven result filtering, and true user-relative distance — plus
the URL persistence (layer + search-area) needed for either to survive a
reload or a shared link. No new backend systems, no schema changes, no
radius-search UI beyond the existing zoom/pan, no geocoding.

**`lib/map-viewport.ts`** (new, pure, dependency-free — mirrors
`lib/map-selectors.ts`'s own convention): `MapBounds` type; bounds
validity/containment (`isValidBounds`, `isWithinBounds`); an
intersection-over-union `boundsOverlapRatio` plus
`shouldShowSearchThisArea` (overlap `< 0.5` after a real user gesture,
never on the initial load or on the geolocation fly-to); URL param
parse/serialize for the active layer and the last-committed search bounds
(`parseMapLayerParam`/`parseBoundsParam`/`buildLiveMapSearchParams`, all
fail-safe against missing/malformed/out-of-range input — never a crash, never
a bogus partial bounds box); and per-entity-type bounds filters
(`filterMapItemsByBounds`/`filterOpportunitiesByBounds`/`filterEventsByBounds`/
`filterOrganizationsByBounds`) that only ever narrow items which already have
a coordinate — a remote/coordinate-less item stays visible regardless of the
search area, exactly like the existing layer filters' own philosophy.

**Privacy contract re-verified under bounds filtering**:
`filterOrganizationsByBounds` re-derives the same privacy-redacted point via
a new shared helper, `effectiveOrganizationCoordinates` (extracted from
`organizationsToMapItems` in `lib/map-selectors.ts` so both paths apply one
rule instead of two copies that could drift) — a hidden/remote organization
is excluded even if its raw coordinates fall inside the searched box, and an
`approximate` organization is filtered using its already-rounded (fuzzed)
point, never gaining precision from the bounds check. Covered by dedicated
tests in `tests/unit/map-viewport.test.ts`.

**"Search this area"** (`LiveMap.tsx`): every camera settle (`onMoveEnd`)
records the live bounds; a *programmatic* settle (initial load, the
geolocation fly-to, or restoring a URL-persisted search area) resets the
comparison baseline instead of ever surfacing the control, so opening the
map never shows "Search this area" before the user has actually moved
anything themselves. A genuine user pan/zoom/drag compares against that
baseline and only surfaces the button once the overlap has dropped
meaningfully. Clicking it commits the current bounds upward to
`LiveBrowser` without moving the camera (the user just moved it — recentering
now would undo their own action) and clears the button immediately.

**URL persistence** (`LiveBrowser.tsx`): the active layer and the committed
search bounds are the entire persisted state — restored from
`useSearchParams()` on mount, kept in sync via `window.history.replaceState`
(shallow, no server round-trip, no extra back-stack entry per change, so
the browser back button returns to wherever the user was before `/live`,
not through intermediate layer/search states — a deliberate choice, not an
oversight). Device geolocation is never part of this: it stays in
component state only, exactly as before. `app/(app)/live/page.tsx` wraps
`LiveBrowser` in `<Suspense>` per Next.js's guidance for `useSearchParams()`
consumers (this route is already fully dynamic via `cookies()`, so this
never actually falls back to the Suspense boundary today — it's future-proofing,
not a behavior change).

**True user-relative distance** (`lib/geo.ts`): `distanceInfo(lat, lng,
userLocation)` returns both the miles and a tagged `source: "user" |
"city-center"` — never a magic sentinel, always explicit about which basis
produced the number. `LiveBrowser` lifts the one-shot geolocation call up
from `LiveMap` (unchanged posture: non-blocking, best-effort, never
persisted, never in the URL) so it's available whether the map or the list
is currently showing, and both the pin detail sheet and the opportunity
card list use the exact same source/value — they can never disagree.
Falls back to the existing city-center distance whenever geolocation is
denied/unavailable/not yet resolved, or for a remote/coordinate-less
opportunity.

**Mobile touch targets**: the new "Search this area" button and the "clear
search area" link both meet the 44px minimum established in Batch 1 for
this screen's tappable controls.

**Verification**: `tsc --noEmit` clean; `eslint .` clean (one pre-existing,
unrelated warning on `MfaEnrollment.tsx`'s `<img>` usage); `vitest run
tests/unit tests/security` **94/94 passing** (30 new tests in
`tests/unit/map-viewport.test.ts`, 8 new tests in `tests/unit/geo.test.ts`,
existing suites unchanged). `npm run build` — see this batch's PR for the
result.

**Not done / explicitly out of scope for Batch 3**: radius-search UI beyond
existing pan/zoom, geocoding/address entry, a second city, live/continuous
geolocation tracking, Work Now V2, Events V2, Passport V2, Wallet.
