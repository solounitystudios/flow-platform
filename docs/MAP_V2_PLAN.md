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

*(Historical — this table reflects the pre-Batch-1 planning snapshot, i.e. what was true before any Map V2 work shipped. Batch 1 implemented the canonical model this table describes as a gap. See [Map V2 Layer Contract (Current, Post-Batch 6)](#map-v2-layer-contract-current-post-batch-6) near the end of this document for what's actually implemented today.)*

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

## Batch 4 Status — QA/Release-Manager Follow-Up Cleanup

Scope: exactly the 4 non-blocking follow-ups identified by the independent
`qa-security` and `release-manager` gates on Batch 3 (PR #8) — no new
feature surface, no zoom/map-list-mode persistence, no geocoding, no
second city.

**Organization bounds-filter privacy contract** (`lib/map-viewport.ts`):
`filterOrganizationsByBounds` previously returned early (`if (!bounds)
return organizations;`) before its `isPublicMapEligible` re-check ran,
so a hidden/remote organization technically passed through unfiltered
when no search area was committed — contradicting the function's own
docstring. Never exploitable in the shipped app (the sole call site in
`LiveBrowser.tsx` always applies `filterOrganizationsForLayer` first, and
`organizations_public` already redacts hidden/remote coordinates
server-side), but the contract now matches the implementation: eligibility
is checked unconditionally, before the `bounds === null` short-circuit.
Approximate-visibility organizations are still filtered on their
already-rounded point only; coordinate-less eligible organizations are
still preserved. The existing `tests/unit/map-viewport.test.ts` case for
`bounds === null` was rewritten from asserting the old (leaky) behavior to
asserting the fixed one.

**Clear Search Area baseline reset** (`lib/map-viewport.ts` +
`LiveMap.tsx`): clearing a committed search area correctly restored the
full result set, but `LiveMap`'s internal comparison baseline for "Search
this area" was never explicitly reset, since no effect watched the
`searchBounds` prop after mount. A new pure `shouldResetSearchBaseline(previous,
next)` (`previous !== null && next === null`) drives a minimal `useEffect`
that re-seeds the baseline from the map's actual live bounds exactly on an
explicit clear — not on mount, not on a restored search area, not on the
geolocation fly-to. Batch 3's `cc46f43` load-time baseline fix is
untouched. Covered by 5 new tests exercising every relevant transition.

**Distance-source UI disclosure** (`lib/geo.ts`, `LiveMap.tsx`,
`OpportunityCard.tsx`): `distanceInfo()`'s `source: "user" | "city-center"`
tag was already computed correctly in Batch 3 but never surfaced — both
the pin detail sheet and the opportunity card rendered plain "X mi"
regardless of source. A new `formatDistanceLabel()` renders `"X mi away"`
for real user-relative distance and `"~X mi from city center"` for the
fallback, used identically at both call sites so they can never disagree
and the fallback can never be mistaken for the user's true position. No
coordinate is ever rendered; geolocation posture (one-shot, non-blocking,
never persisted) is unchanged.

**Mobile cleanup** (`LiveBrowser.tsx`): the map/list view-toggle buttons
(previously ~28px) now meet the 44px touch-target minimum this screen's
other controls already met, via `min-h-11 min-w-11` absorbed into padding
rather than growing the visible icon — no change to visual hierarchy. The
results grid gained an explicit base `grid-cols-1` before `sm:grid-cols-2`
(functionally a no-op given CSS grid's default single-column behavior, but
makes the intent explicit).

**Verification**: `tsc --noEmit` clean; `eslint .` clean (one pre-existing,
unrelated warning on `MfaEnrollment.tsx`'s `<img>` usage); `vitest run
tests/unit tests/security` **99/99 passing** (5 new tests for
`shouldResetSearchBaseline`, the rewritten organization-privacy test);
`npm run build` succeeded. GitHub Actions CI green. Independently verified
by both `qa-security` (PASS) and `release-manager` (READY WITH
FOLLOW-UPS) gates before merge.

**Known non-blocking follow-ups carried forward**: `formatDistanceLabel`
has no dedicated unit test in `tests/unit/geo.test.ts` (exercised
indirectly via both call sites only); mobile viewport rendering, the
authenticated interactive map sequence, and screen-reader behavior for the
new distance wording were verified via code trace and static analysis
only — no real browser/device/assistive-tech session, consistent with
every prior Map V2 batch's verification depth in this repo.

**Batch 4 shipped**: PR #9, merged to `main` at commit
`87a619a96461a4987f294562851f2b0323a38a6a` after GitHub Actions CI and
both independent review gates reported green.

**Not done / explicitly out of scope for Batch 4**: everything Batch 3
already deferred (radius-search UI, geocoding/address entry, a second
city, live/continuous geolocation tracking, exact zoom persistence,
map/list mode persistence, Work Now V2, Events V2, Passport V2, Wallet) —
this batch closed out review follow-ups only, it did not open any new
scope.

## Batch 5/6 Status — View/Camera Persistence, URL Versioning, Recovery Polish

Scope: the two items every prior batch explicitly deferred — view-mode
(map/list) persistence and live-camera (center/zoom/bearing/pitch)
persistence — plus a URL state-version marker, in-map empty/error recovery
actions, a lightweight results-count line, 44px touch targets on the map's
built-in zoom/geolocate controls, and a pure `resolveSelectedMapItem`
extraction. Shipped as PR #11 in two commits: the feature work itself
(`1c14135`), then a QA-caught privacy fix (`47da3d5`) before merge — both
included in the same PR since the fix was required before the feature
could ship at all.

**View mode + live camera persistence** (`lib/map-viewport.ts`,
`LiveBrowser.tsx`): `view` (`"map" | "list"`) and `vp` (rounded
lat/lng/zoom/bearing/pitch, same ~11m rounding as search-area bounds) join
the existing `layer`/`b` params, all still written via
`window.history.replaceState` (no new back-stack entries).
`resolveInitialCameraSource` decides, on load, whether to seed the camera
from a restored search area, a restored raw viewport, or the existing
city-center default — a committed search area takes priority over a bare
viewport when both are present.

**State-version marker** (`MAP_STATE_VERSION` / `MAP_VERSION_PARAM = "v"`):
a URL with no `v` param (every pre-existing shared/bookmarked `/live` link)
is still trusted; a URL whose `v` doesn't match the current version causes
`b`/`view`/`vp` to fall back to defaults rather than being mis-parsed under
a future, incompatible shape. `layer` is not version-gated (its value space
hasn't changed shape).

**Selected-item recovery** (`resolveSelectedMapItem`): the exact lookup
`LiveMap.tsx` already used inline (`items.find((i) => i.id === selectedId)
?? null`) extracted into a pure, unit-tested function — not new behavior,
just made independently testable.

**Recovery polish**: a map-tile/load-error "Try again" action (remounts
`MapGL` via a bumped `mapInstanceKey`); an in-map "Clear filters and search
again" action (`onResetFilters`) for the zero-results case with no search
area committed; the same action now also covers the equivalent list-view
empty state (previously had no action at all — closed in this same pass); a
"N results" line above the grid (`aria-live="polite"`, hidden on small
screens while in map view).

**Touch targets**: the map/list toggle buttons already met 44px as of Batch
4; this batch adds a scoped CSS override
(`.flow-live-map-controls .maplibregl-ctrl-group button`) forcing
maplibre's own built-in `NavigationControl`/`GeolocateControl` buttons from
their default ~29px up to 44px.

**Privacy fix bundled into this same PR** (`47da3d5`): the initial
persistence work introduced a real regression — the one-shot geolocation
"Locate Me" `flyTo`'s resulting camera settle was being reported through
the same `onViewportChange` path as any real user pan/zoom, so it got
persisted into the `vp` URL param — the user's device location, at ~11m
precision, silently entering a shareable/loggable/reload-persistent URL.
Caught by the `qa-security` review gate before merge, not after. Fixed with
a synchronous ref (`isFlyingToUserRef`) set immediately before that one
`flyTo` call and read-then-cleared at the top of `handleMoveEnd`,
suppressing only that one settle's `onViewportChange` call — every other
settle (initial load, a restored search area, and every real user gesture)
is unaffected. Re-verified against maplibre-gl's own event-ordering source
to confirm an interrupted fly-to (a user grabbing the map mid-animation)
can't cause a real gesture's settle to be wrongly suppressed. See Map V2
Privacy Invariants below — this fix is now load-bearing for invariant #2.

**Verification**: `tsc --noEmit` clean; `eslint .` clean (one pre-existing,
unrelated warning on `MfaEnrollment.tsx`'s `<img>` usage); `vitest run
tests/unit tests/security` **136/136 passing**; `npm run build` succeeded
locally and GitHub Actions CI (`typecheck, lint, test, build`) reported
green on PR #11. Independently reviewed by both `release-manager` (PASS)
and `qa-security` (initial FAIL on the privacy regression above, PASS on
re-verification after the fix) before merge.

**Batch 5/6 shipped**: PR #11, merged to `main` at commit
`5d05be9eef48af4634c0338a12eb60ce7e3befbd`.

**Not done / explicitly out of scope for Batch 5/6**: everything every
prior batch already deferred (radius-search UI beyond pan/zoom,
geocoding/address entry, a second city, live/continuous geolocation
tracking, Work Now V2, Events V2, Passport V2, Wallet), plus: a standalone
"Reset map" button, new analytics infrastructure, browser E2E test
infrastructure, an application-wide accessibility rewrite, and fixing the
pre-existing layer-toggle pin re-selection quirk (confirmed to predate this
batch — see Accepted Limitations Register below). See the Decision Log
below for why each was deliberately deferred rather than forgotten.

---

# Map V2 Canonical Reference (Post-Batch 6)

Everything below this line is a living reference to how Map V2 actually
works today, not a chronological batch record. Update these sections in
place as future batches land; keep the batch-status sections above as
historical record only.

## Map V2 Architecture Snapshot

High-level data flow, current as of Batch 5/6:

```
discovery sources (getOpenOpportunities / getUpcomingEvents / getDiscoverOrganizations)
  → lib/map-selectors.ts: normalized MapItem[] (entityType, isWorkNow, coordinates, layer-safe fields)
  → layer/filter selection (MapLayer, one model driving both map and list — LiveBrowser)
  → searched viewport (lib/map-viewport.ts: committed search-area bounds, restored from/persisted to URL)
  → LiveMap.tsx: MapLibre rendering + per-entity-type clustering
  → selected entity (resolveSelectedMapItem — transient, not URL-persisted)
  → DetailSheet
  → detail-page navigation (real page nav, not intercepted)
  → state restoration on return (URL-persisted layer/bounds/view/viewport restore the map; selection does not restore, by design — see State Ownership Matrix)
```

Responsibilities:

- **Discovery data fetchers** (`getOpenOpportunities`, `getUpcomingEvents`,
  the discover-organizations query) — own fetching public-safe records
  server-side; the map/list layer never queries Supabase directly.
- **`lib/map-selectors.ts`** — the one normalization layer. Pure,
  dependency-free, privacy-aware (never fabricates a coordinate, enforces
  `organizations.location_visibility` a second time for demo-mode parity
  with the DB view). Owns the `MapEntityType`/`MapLayer`/`isWorkNow` model
  and `mapItemMatchesLayer`.
- **`lib/map-viewport.ts`** — the one place that owns bounds/viewport math,
  URL param parse/serialize, the version marker, and
  `resolveSelectedMapItem`. Pure, dependency-free, extensively unit-tested.
- **`LiveMap.tsx`** — MapLibre rendering, clustering, camera control
  (including the one-shot geolocation fly-to and its privacy guard), pin
  selection, empty/error recovery UI for the map itself.
- **`LiveBrowser.tsx`** — owns the URL-sync effect (the only place that
  calls `window.history.replaceState` for this route), the layer/list
  filter reconciliation, the results-count line, and the below-map card
  grid/empty state.
- **`components/ui/DetailSheet.tsx`** — the shared pin-detail primitive —
  mobile bottom sheet, desktop floating card, focus trap, Escape-to-close.

This is a snapshot of contracts and invariants, not a line-by-line
internals map — expect implementation details inside each file to keep
evolving; the contracts above are what future work should preserve.

## Map V2 URL State Contract

`/live`'s URL is the only persisted-state surface Map V2 has (no
server-side session, no database table for "last map view"). Everything
below is read by `LiveBrowser.tsx` on mount via `useSearchParams()` and
kept in sync via `window.history.replaceState` (never `pushState` — see
Search This Area Specification for why).

**Persisted (shareable, safe to log, safe to bookmark):**

| Param | Meaning | Default when absent |
|---|---|---|
| `layer` | Active `MapLayer` (`all`/`work_now`/`gig`/`job`/`volunteer`/`event`/`business`) | `all` |
| `b` | Committed search-area bounds (rounded to ~11m) | none (no search area committed) |
| `view` | `map` or `list` | `map` |
| `vp` | Live camera: lat/lng/zoom/bearing/pitch (rounded to ~11m for position) | none (falls back to `b`, then the city-center default) |
| `v` | State-version marker (`MAP_STATE_VERSION`, currently `1`) | treated as version 1 / trusted |

**Version/backward-compatibility behavior**: a URL missing `v` entirely
(every link generated before this marker existed, and every link where
nothing was ever customized) is trusted as-is. A URL whose `v` doesn't
match the current `MAP_STATE_VERSION` causes `b`, `view`, and `vp` to fall
back to their defaults rather than being parsed under a shape they may no
longer match — `layer`'s parser is not version-gated since its value space
hasn't changed shape. This is a single integer bump, not a migration
framework — bump it only when an incompatible shape change to `b`/`view`/`vp`
actually ships.

**Malformed-value fallback behavior**: every parser (`parseMapLayerParam`,
`parseBoundsParam`, `parseMapViewParam`, `parseViewportParam`) rejects
unrecognized/out-of-range/non-numeric input and returns the same safe
default it would return for a missing param — never throws, never produces
a partial/inconsistent state. Covered by adversarial unit tests (garbage
strings, wrong field counts, `NaN`/`Infinity`, out-of-range lat/lng).

**Stale selected-entity behavior**: the selected entity is NOT part of the
URL (see State Ownership Matrix) — there is no "selected id" param to go
stale. If one were ever added, it would need the same recovery guarantee
`resolveSelectedMapItem` already provides for the in-session case: an id no
longer present in the current `items` resolves to no selection, never a
crash or a mismatched sheet.

**History behavior**: every param above is written via `replaceState`,
never `pushState` — panning, zooming, toggling a layer, or switching view
mode never creates a new browser-history entry. This is deliberate: it
means the browser Back button, after visiting `/live`, returns to wherever
the user was *before* `/live`, not through a chain of intermediate map
states.

**Intentionally NOT persisted, ever:**

- **Exact device-derived user coordinates.** The one-shot geolocation
  call's result lives in `LiveBrowser`/`LiveMap` component state only and
  is never written to a URL param. The camera settle produced by flying to
  that location is explicitly suppressed from the `vp`-persistence path
  (`isFlyingToUserRef` in `LiveMap.tsx`, added in the `47da3d5` privacy
  fix) — this is the one place a device-derived coordinate could have
  leaked into `vp`, and it's the one place explicitly guarded against it.
  If a future change ever adds a new geolocation-driven camera movement, it
  must apply the same "suppress this specific settle from
  `onViewportChange`" pattern, not just trust that geolocation itself
  "isn't in the URL."
- Private profile/home location.
- Auth/session information (no session/auth data touches this route's URL
  at all).
- Private organization membership information.
- Secrets/tokens (none exist on this route to begin with).

## Map V2 Privacy Invariants

Permanent engineering rules — any future Map V2 (or Map V3) change must
preserve these, not just avoid breaking the current tests:

1. **Device location is ephemeral user-context data.** It exists only to
   compute a distance or center a one-shot fly-to; it is never a piece of
   state the map "remembers" beyond the current page session.
2. **Exact device-derived coordinates must not be serialized into
   shareable URLs.** Any code path that turns a geolocation result into a
   camera movement must explicitly prevent that movement's resulting
   settle from reaching URL persistence — see the URL State Contract above
   and the `47da3d5` fix for the concrete pattern.
3. **Public pins must originate only from data explicitly safe for public
   discovery** — `getOpenOpportunities`/`getUpcomingEvents`
   (status-filtered) and `getDiscoverOrganizations`/`organizations_public`
   (never the raw `organizations` table for public-facing output).
4. **Private profile/home location must never be treated as public map
   location.** Nothing in this codebase currently attempts to map a user's
   profile/home address; if that ever changes, it must go through an
   equivalent privacy-visibility gate to `organizations.location_visibility`,
   never a raw coordinate pass-through.
5. **Remote opportunities must not receive fake physical coordinates.** A
   coordinate-less/remote item renders no pin — never a city-center or
   `0,0` guess.
6. **Invalid coordinates must fail safely and must never fall back to
   `0,0`.** Bounds/viewport/coordinate validation rejects `null`/`NaN`/
   out-of-range values and excludes the item from map rendering rather
   than plotting a default point.
7. **Location permission denial must not break map usage.** Geolocation is
   one-shot and best-effort; every distance calculation has a
   non-geolocation fallback (`distanceInfo`'s `"city-center"` source), and
   the map itself never blocks on a permission prompt.

## Map V2 Layer Contract (Current, Post-Batch 6)

Supersedes the pre-Batch-1 planning table earlier in this document — that
table describes what was requested before Batch 1 shipped; this table
describes what's actually implemented today, verified against
`lib/map-selectors.ts`.

| Layer (`MapLayer`) | Source entity | Coexistence | Coordinate requirement | Status |
|---|---|---|---|---|
| `all` | — | Default; every other layer active simultaneously | n/a | Live |
| `work_now` | `opportunities` where `urgent` (computed: on-site + starts <6h) | Cross-cutting — an item can be both `work_now` and its own `entityType` layer | Same as its underlying opportunity | Live |
| `gig` | `opportunities` where `opportunity_type IN ('gig','project')` | Own layer | lat/lng, or excluded from the map (remains in list) | Live |
| `job` | `opportunities` where `opportunity_type = 'job'` | Own layer | Same | Live |
| `volunteer` | `opportunities` where `opportunity_type = 'volunteer'` | Own layer | Same | Live |
| `event` | `events` where `status = 'published'` | Own layer | Same | Live |
| `business` | `organizations_public` where `location_visibility IN ('exact','approximate')` | Own layer | Requires the organization to have geocoded lat/lng AND a non-`hidden`/non-`remote` visibility setting | **Honestly enabled, data-dependent** — the code path is fully correct end-to-end, but will show few or no pins in practice until organizations actually have coordinates set and a non-hidden visibility. This is a data-completeness fact, not a bug or a stub. |

**Layer toggling and selection**: switching the active layer re-filters
`items` via `mapItemMatchesLayer`; if the currently selected entity no
longer matches the new layer, `resolveSelectedMapItem` returns `null` on
the next render and the detail sheet closes — it does not keep showing a
pin that's no longer visible. See the Accepted Limitations Register for the
one case this does NOT fully cover (re-enabling a layer that makes a
previously-deselected item visible again).

**Disabled/missing data behavior**: a layer with zero currently-eligible
items renders the map's empty state (with a "Clear filters and search
again" recovery action), not a blank map with no explanation.

## Search This Area — Specification

Product/engineering contract for the "Search this area" control:

1. User moves or zooms the map (pan, zoom, or drag).
2. The currently searched result set (whatever bounds were last explicitly
   committed, or none) stays stable through ordinary movement — moving the
   camera never silently refetches or reshuffles results.
3. Once the live camera has diverged meaningfully from the last
   searched/reference bounds, the "Search this area" button appears.
4. The user explicitly taps/clicks it.
5. The current live viewport becomes the new committed search area, which
   is what actually filters the result set (map pins and the card list
   identically — see State Ownership Matrix).
6. The result set updates to whatever falls inside the new committed
   bounds (an item with no coordinate at all is never spatially filtered
   either way).
7. The button disappears (the new bounds become the new baseline) until
   the camera diverges meaningfully again.

**Why not auto-refetch on every movement**: continuous refetch-on-pan
would make results feel unstable/flickery mid-gesture, hide the user's own
search intent behind a moving target, and cost a query per frame of
movement at real usage volume. An explicit commit step is deliberate,
small friction that keeps the result set predictable.

**Threshold behavior (conceptual, not contractual)**: "meaningful
divergence" is computed as an intersection-over-union overlap ratio
between the live camera bounds and the reference bounds
(`lib/map-viewport.ts`) — below a threshold, the button appears. The exact
numeric threshold is an implementation tuning value, not a product
contract; it may be adjusted without this document needing to change, as
long as the qualitative behavior (stable until meaningfully diverged,
explicit user commit, no auto-refetch) is preserved.

**Programmatic vs. gesture moves**: initial page load, restoring a
URL-persisted search area, and the geolocation fly-to are all programmatic
settles — none of them ever surface the button; only a genuine user-driven
pan/zoom/drag can. This is also the same signal the geolocation-URL
privacy guard piggybacks on (see URL State Contract) — the two concerns
are related but distinct: one governs when the button shows, the other
governs what gets persisted to the URL.

**Client-side filtering vs. server responsibility**: the server query
fetches the full public-safe candidate set once (no per-pan server
round-trip); bounds filtering happens entirely client-side against that
already-fetched set. This is a single-city-scale design choice — a
materially larger candidate set would need a server-side spatial query
instead, which is out of scope for Map V2 (see Map V3 Boundary).

**Persistence relationship between searched viewport and camera
viewport**: committed search bounds (`b`) and the live camera (`vp`) are
persisted independently and can diverge — after committing a search area,
the user can keep panning/zooming without re-committing, and `vp` tracks
that live camera while `b` stays put until the next explicit commit. On
reload, `resolveInitialCameraSource` prefers `b` over `vp` when both are
present (a committed search area is a stronger signal of intent than
wherever the camera happened to be).

## Map V2 State Ownership Matrix

| State | Category | Owner | Notes |
|---|---|---|---|
| Active layer (`layer`) | URL / shareable | `LiveBrowser` (URL-sync effect) | Drives both map and list identically |
| Committed search-area bounds (`b`) | URL / shareable | `LiveBrowser` | Privacy-safe (rounded, only ever narrows already-public/geocoded items) |
| View mode, map vs. list (`view`) | URL / shareable | `LiveBrowser` | |
| Live camera — center/zoom/bearing/pitch (`vp`) | URL / shareable, with one exception | `LiveBrowser`/`LiveMap` | The one settle produced by the geolocation fly-to is explicitly excluded — see Privacy Invariants #2 |
| State-version marker (`v`) | URL / shareable | `lib/map-viewport.ts` | Governs `b`/`view`/`vp` parsing only |
| Selected entity | Transient client state | `LiveMap` (`useState`) | **Not URL-persisted** — deep-linking directly to a specific open pin is not currently supported; resolved defensively every render via `resolveSelectedMapItem` |
| Detail-sheet open/closed | Transient client state | `LiveMap` (derived from selected entity) | Not a deep-linkable concept independent of the selection |
| Hover/focus state | Transient client state (DOM/React only) | Component-local | Never persisted anywhere |
| Loading/error/empty UI state | Transient client state | `LiveMap`/`LiveBrowser` | Recomputed every render from data + params, never itself persisted |
| Map interaction state (mid-drag/mid-zoom) | Transient client state | MapLibre/`react-map-gl` internal | Only the settled result crosses into persistence |
| Exact device geolocation | Ephemeral private device state | `LiveBrowser`/`LiveMap` component state | One-shot, best-effort, **never persisted anywhere**, never in a URL, never in `localStorage`/`sessionStorage` |
| Geolocation permission result | Ephemeral private device state | Browser API + component state | Not tracked/stored beyond the current page load |
| Current device-derived distance origin | Ephemeral private device state | `lib/geo.ts` (`distanceInfo`) | Tagged `source: "user" \| "city-center"` so the UI never conflates the two |
| Public opportunity/event/business coordinates | Server/database state | Supabase (`opportunities`, `events`, `organizations`/`organizations_public`) | The only durable, cross-session, cross-user source of truth for map pins |
| Publish/status information (`status`, `location_visibility`) | Server/database state | Same tables | Read-only from the map's perspective — the map never writes back to these |
| Discovery records themselves | Server/database state | Same tables, via the discovery data fetchers | |

There is no `localStorage`/`sessionStorage` involvement anywhere in Map V2
today — every persisted-state example above is URL-based. If a future
batch adds client-storage-based persistence, it should be added as its own
row here, not silently assumed under "URL state."

## Map Entity Contract (`MapItem`)

The one normalization layer every discoverable thing on the map goes
through (`lib/map-selectors.ts`). Conceptual contract, not a schema:

- **Stable ID** — unique within its entity type.
- **Entity type** — `"gig" | "job" | "volunteer" | "event" | "business"`.
- **`isWorkNow`** — cross-cutting boolean, independent of entity type (an
  item is never forced to choose between "this is a job" and "this is
  Work Now").
- **Display title/name.**
- **Public coordinates** — already privacy-redacted for organizations (see
  Privacy Invariants). Never fabricated.
- **Layer** — derived via `mapItemMatchesLayer`, not a stored field — a
  `MapItem` doesn't need to know which layer it belongs to; the matcher
  computes it from entity type/`isWorkNow`.
- **Public route/detail destination.**
- **Status/availability** — surfaced per entity type (e.g. verified,
  urgency, positions-remaining) rather than one generic status enum.
- **Optional user-relative distance** — not stored on the item itself;
  computed on demand via `distanceInfo()`, always tagged with its source
  (`"user"` or `"city-center"`).
- **Primary action** — one CTA per entity type ("View & Apply" / "View &
  Register" / "View organization"), resolved by the consuming component,
  not stored on the item.

**Coordinate validation expectations:**
- Latitude must be within `-90..90`, longitude within `-180..180`.
- `null`/`undefined`/`NaN`/non-numeric-string values are rejected, not
  coerced.
- `0,0` is never used as a fallback for a missing coordinate.
- An item failing validation is excluded from map rendering only — it
  remains available through non-map surfaces (its own detail page, the
  card list where applicable) exactly as before.

This is a conceptual/behavioral contract, not a proposal to formalize
`MapItem` as a shared database schema — it stays a TypeScript-only
normalization layer, deliberately.

## Map V2 Regression-Protection Notes

Areas future changes to this surface should re-verify, with where existing
coverage lives:

- **Malformed URL state** — `tests/unit/map-viewport.test.ts` (adversarial
  input cases for every parser).
- **Missing/old version marker** — same file, version-gated parser tests.
- **Selected item no longer existing** — `resolveSelectedMapItem` tests,
  same file.
- **Selected entity filtered out by a layer change** — covered
  conceptually by the same `resolveSelectedMapItem` contract (it re-runs
  against whatever the current item list is); no dedicated "layer change
  deselects" test exists as a named case — worth closing if this behavior
  regresses.
- **Invalid coordinates** — bounds/viewport validation tests,
  `tests/unit/map-selectors.test.ts`'s coordinate-rejection cases.
- **Duplicate entity results** — no dedicated regression test exists for
  this specifically; the invariant currently holds structurally (each
  underlying entity produces exactly one `MapItem`), not via an explicit
  dedup test.
- **Search This Area threshold behavior** — overlap/baseline-reset tests,
  `tests/unit/map-viewport.test.ts`.
- **State restoration** — parser/`resolveInitialCameraSource` tests, same
  file.
- **Geolocation denial** — no automated test (geolocation itself isn't
  unit-testable without a browser); covered by code review only —
  `distanceInfo`'s fallback path and the map's non-blocking posture.
- **Device-location privacy** — the fly-to persistence guard is verified
  by code trace/review (see Batch 5/6 Status and the `47da3d5` commit), not
  by an automated test — this repo has no way to simulate a real
  `flyTo`/`moveend` sequence in `vitest` without a browser/map-rendering
  harness.
- **Hydration** — no automated test; verified by code review (state
  initializers read `useSearchParams()` consistently on server and
  client, no `window`/storage access during render).
- **Persistence write frequency** — verified by code review (writes happen
  on settled camera events and explicit user actions, never on raw
  drag/zoom ticks); no dedicated test asserting call counts.
- **Map/list result consistency** — both derive from the same filtered
  arrays in `LiveBrowser`; no dedicated cross-check test, this is
  structural.

Where this list says "no dedicated test," that's a real, honestly-reported
gap — not a claim the behavior is untested in every sense (most are still
covered by code review/tracing at merge time), just that there's no
`vitest` assertion a future refactor would trip if it broke.

## Accepted Limitations Register

1. **Browser E2E coverage.** No automated browser E2E coverage currently
   verifies Back/forward map-state restoration, because the repository
   does not currently have browser E2E infrastructure (only `vitest`
   unit/security tests exist under `tests/unit`/`tests/security`).
   Disposition: **Accepted infrastructure gap, not currently a Map V2
   production blocker.**
2. **Physical device rotation QA.** No physical-device rotation/resize
   test has been performed as part of automated release validation.
   Disposition: **Manual QA gap, not currently a code blocker.**
3. **Layer-toggle pin re-selection quirk.** A previously deselected pin
   may reopen if its underlying layer is disabled and later re-enabled
   (because selected-item resolution re-runs against whatever the current
   item list is, and a re-enabled layer can bring the same id back into
   that list). Disposition: **Known product quirk, confirmed (via `git
   show` against the pre-Batch-5 code) to predate the Map V2
   state-persistence branch — not fixed in this pass, not claimed to be
   fixed.**

## Decision Log — Deliberately Deferred, Not Forgotten

- **Standalone "Reset map" button**: evaluated during the Batch 5/6
  hardening pass and judged redundant — "Clear search area" (pre-existing)
  and "Clear filters and search again" (new this batch) already cover
  every practical recovery path; a third, overlapping reset control was
  judged more likely to confuse than help.
- **New analytics infrastructure/vendor**: no analytics/event abstraction
  exists anywhere in this repository today. Rather than introduce one
  solely for Map V2 instrumentation, recommended future event names were
  documented (below) for whenever a real analytics abstraction is adopted
  repo-wide.
- **New global state library**: URL params + component state have been
  sufficient for every Map V2 batch so far; no cross-page or cross-session
  state need has emerged that would justify one.
- **New schema just for map persistence**: every persisted value lives in
  the URL, computed from data that already has a schema
  (opportunities/events/organizations). No new table/column was ever
  needed.
- **Browser E2E framework**: a real gap (see Accepted Limitations Register
  #1), but standing up an E2E framework for the whole repo is a
  project-wide infrastructure decision, not a Map V2-scoped one.
- **Broad application accessibility rewrite**: Map V2's own controls got a
  targeted pass (44px touch targets, existing labels confirmed present,
  `DetailSheet`'s existing focus trap/Escape-to-close reused) — but a full
  app-wide accessibility audit is explicitly out of scope for a
  map-feature batch.
- **Map V3 feature expansion**: anything in the Map V3 Boundary section
  below was deliberately not pulled forward into this closeout pass, even
  where it would have been a natural extension of what's here.

**Recommended future analytics events** (if/when a real event abstraction
exists): `map_viewed`, `map_layer_toggled`, `map_search_area`,
`map_locate_used`, `map_pin_opened`, `map_detail_action`,
`map_empty_state`, `map_reset`. Any future implementation of these must
use coarse/public metadata only (e.g. layer name, entity type, city) —
never exact user coordinates, consistent with the Privacy Invariants
above.

## Map V3 Boundary

Map V2 maintenance must preserve the contracts documented above. The
following are examples (not commitments) of capability that would require
a separately scoped future initiative rather than an incremental addition
to Map V2:

- Full turn-by-turn routing/navigation.
- Real-time moving-user location tracking (as opposed to the current
  one-shot, best-effort geolocation).
- Heatmaps or density intelligence layers.
- Advanced/server-side geographic search (radius search beyond pan/zoom,
  geospatial query infrastructure).
- Richer live city-activity layers beyond the current five entity types.
- Large-scale analytics infrastructure/rollout.
- A new mapping provider/architecture (replacing MapLibre/OpenFreeMap).
- New public-location schema work beyond `organizations.location_visibility`.
- Significant real-time presence architecture (who else is nearby right
  now, live).

If a request touches any of these, treat it as a new, separately scoped
batch — not an "optional addition" folded into ongoing Map V2 maintenance.

## Manual Founder/Device QA Checklist

For use on iPad/iPhone/desktop before a significant Map V2 change ships:

- [ ] Map loads on `/live`
- [ ] Portrait orientation renders correctly
- [ ] Landscape orientation renders correctly (rotate mid-session, not
      just fresh load)
- [ ] Each layer chip toggles independently
- [ ] Multiple layers active simultaneously show combined pins correctly
- [ ] "Search this area" appears after real movement, not on load
- [ ] "Search this area" commits and updates results
- [ ] Map pan/zoom feels responsive, no dropped frames on a real device
- [ ] "Locate Me" / geolocate control works
- [ ] Denying location permission doesn't break the map or throw a
      visible error
- [ ] Opening a pin shows the detail sheet with correct content
- [ ] Closing the detail sheet returns to the expected map state
- [ ] Opening a pin's full detail page navigates correctly
- [ ] Browser Back from a detail page returns to a sensible map state
- [ ] Refreshing `/live` preserves layer/search-area/view/camera as
      expected
- [ ] Copying the current URL and opening it in a new tab/session
      restores the same state
- [ ] An area with zero results shows an actionable empty state, not a
      blank map
- [ ] A simulated data-load failure (if reproducible) shows a recoverable
      error state
- [ ] An invalid/stale selected entity (e.g. via a hand-edited URL) fails
      safely, no crash
- [ ] No overlap between the map's own controls and site navigation
      (top/bottom bars)
- [ ] All map control touch targets feel comfortably tappable, not
      cramped
- [ ] No accidental horizontal page overflow/scroll on any tested
      viewport
- [ ] Inspect the address bar after granting location — confirm no
      precise device coordinates appear in the URL

## Production Readiness Checklist

Run this before any future significant Map V2 change ships:

1. Can a first-time user understand what the map does?
2. Can the map be used without granting location access?
3. Can users recover from a bad filter/search state?
4. Does navigation (Back, refresh, shared link) preserve useful map
   context?
5. Does refresh preserve safe/useful state?
6. Can malformed persisted state crash the page?
7. Can bad coordinates crash map rendering?
8. Are private locations protected?
9. Are mobile/tablet controls usable?
10. Are discovery/map results consistent with the list?
11. Does "Search this area" require intentional user action rather than
    firing continuously?
12. Are persistence writes controlled (not on every raw movement event)?
13. Are schema/RLS requirements for this change explicit and resolved?
14. Are unavailable/data-dependent layers (e.g. Businesses) represented
    honestly rather than claimed complete?
15. Are any known blockers clearly recorded, not hidden?

As of Batch 5/6 (this document's current state), every question above is
answered affirmatively except where the Accepted Limitations Register
above records an explicit, honestly-disclosed gap.
