// FLOW-SEC-001 — RLS-level regression matrix (STAGING_ONLY).
//
// tests/security/flow-sec-001.test.ts covers the TypeScript-side predicate
// (canAttributeToOrganization) with zero external dependencies — that file
// is part of the required, credential-free baseline (`npm run test`,
// `npm run test:security`) and runs in CI on every push/PR.
//
// This file is the other half: proving the database itself independently
// enforces the same rule (defense-in-depth means a bug in the TS check
// alone should not be exploitable), for scenarios a pure function can't
// model — a suspended member, an unrelated authenticated user, an
// anonymous caller, and a raw Supabase insert that bypasses the Server
// Action entirely. That needs real Supabase auth users and real rows, which
// this repo does not yet have a safe place to create:
//
//   - There is no Supabase branch/staging project configured for this repo
//     today (see .claude/FLOW_ORCHESTRATION.md's Supabase safety rules) —
//     only the single production project exists.
//   - Per FLOW Test Lab safety rules, this suite is classified
//     STAGING_ONLY: it must never run against production, never create
//     fake production organizations/users, and must never be wired into
//     the required CI baseline or the default `npm run test`.
//
// Until a staging project exists, this file documents the exact matrix as
// `it.todo(...)` — visible in every test run as pending, not silently
// missing, and not counted as a failure. A future batch that provisions a
// staging Supabase project should implement these against it (create throw-
// away auth users + an org + a member row per case, assert the insert/
// update outcome, then tear everything down) and flip this file's gate to
// run automatically only when a `SUPABASE_STAGING_URL`-shaped env var is
// present — never in the default/required run.
//
// The live-database half of this fix (real production project, read-only
// verification plus safely-cleaned-up test rows) was instead run manually,
// once, by the agent that implemented this fix — see the release audit
// report's "SECURITY REVIEW AFTER FIX" section for those results, since a
// one-time authorized manual check is a different thing from an
// unattended automated suite touching production.
import { describe, it } from "vitest";

describe.todo("FLOW-SEC-001 RLS matrix (STAGING_ONLY — needs a staging Supabase project, see file header)", () => {
  it.todo("opportunity creation: owner → own organization = PASS");
  it.todo("opportunity creation: owner → other organization = DENY (RLS WITH CHECK rejects the insert)");
  it.todo("opportunity creation: active non-owner member → own organization = current explicitly supported behavior only (today: DENY, member posting is deferred)");
  it.todo("opportunity creation: suspended member → own organization = DENY");
  it.todo("opportunity creation: unrelated authenticated user → organization = DENY");
  it.todo("opportunity creation: anonymous → organization = DENY (no INSERT grant reaches anon at all)");
  it.todo("opportunity update: existing listing cannot be reassigned to an unauthorized organization via direct Supabase update");
  it.todo("event creation: same matrix as opportunity creation");
  it.todo("event update: same matrix as opportunity update");
});
