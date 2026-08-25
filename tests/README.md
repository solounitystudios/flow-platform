# FLOW automated tests

Phase 1 of the FLOW Test Lab's automated coverage. Runner: **Vitest** —
chosen over Jest for zero-config TypeScript/ESM support that matches this
repo's `tsconfig.json` directly, fast startup, and because it shares
tooling with Vite-based projects without pulling in a second bundler
config. **Playwright is deliberately not included yet** — a real browser
E2E suite needs either a live dev server with real Supabase auth or a
dedicated staging project, neither of which exists for this repo today;
adding it now would mean either skipping it in CI (dead weight) or wiring
CI to production credentials (against this batch's explicit safety rules).
It's the natural next phase once a staging Supabase project exists.

## Structure

- **`tests/unit/`** — pure logic, zero dependencies beyond the module under
  test. No Next.js, no Supabase, no network. Currently: Map V2 location-safety
  selectors.
- **`tests/security/`** — same constraints as `tests/unit/` (pure, no
  credentials needed), but specifically the authorization predicates that
  also have a live RLS policy enforcing the identical rule — FLOW-SEC-001,
  organization owner/member protections, and the open-redirect guard.
- **`tests/integration/`** — tests that need real infrastructure (a live
  Supabase project, real auth users). **Not part of the required baseline**
  (`npm run test`) and **not run in CI**. Every file here is entirely
  `it.todo(...)` today: none of them can run until a staging Supabase
  project exists (see .claude/FLOW_ORCHESTRATION.md's Supabase safety
  rules) — see each file's header for its own plan, e.g.
  `flow-sec-001.rls.test.ts` (organization attribution),
  `flow-sec-002.rls.test.ts` (Batch A: event/opportunity organization
  integrity), and `application-evidence-reference.rls.test.ts` (Priority #1
  Batch 1: application-linked verification evidence).

Every pure-logic module under test lives in a dependency-free file (no
`next/headers`, no `@/lib/supabase/*` imports) specifically so it can be
unit tested without any Next.js/Supabase runtime — see `lib/authz.ts`,
`lib/map-selectors.ts`, `lib/redirect-safety.ts`. Production code imports
and calls these same functions rather than reimplementing the logic inline,
so a test failure here means the *actual* production decision changed, not
a parallel copy that could drift.

## Commands

| Command | Runs | Needs credentials? | Part of required CI? |
|---|---|---|---|
| `npm run test` | `tests/unit` + `tests/security` | No | Yes |
| `npm run test:security` | `tests/security` only | No | No (subset, for the Test Lab's Security agent) |
| `npm run test:flow:quick` | `tests/unit` + `tests/security` | No | No (alias for the Test Lab's Quick Check button — currently identical to `test` since Phase 1 has no slower suite yet; will diverge once Playwright/E2E is added and `test` grows to include it) |
| `npm run test:integration` | `tests/integration` (currently all `it.todo`) | Would, once implemented | No — deliberately excluded, see above |

## Adding a test

If the logic under test can be expressed as a pure function taking plain
data and returning a plain result, put it in `tests/unit/` or
`tests/security/` (security-relevant → `tests/security/`) and extract the
function into a dependency-free module if it isn't already one. If it
genuinely needs a live database or a browser, it belongs in
`tests/integration/` (staging-only, `it.todo` until a staging project
exists) — do not wire new tests into the required baseline that need
credentials this repo doesn't have.
