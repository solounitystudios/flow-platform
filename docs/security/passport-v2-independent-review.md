# Passport V2 — independent security & integrity review (PRs #27–#32)

Reviewed: 2026-09-20 · stack tip `c52d59f` (#32) · method: read all seven migrations + the gateway, then **attack a
freshly-replayed database** (catalog interrogation, 35+ executable probes, real-concurrency probes) and mutation-test the
tests themselves. Evidence: `tests/db/repros/`. Fixes: `20260919120700_passport_v2_review_fixes.sql` + code changes in this PR.

**Verdict: no BLOCKER. Two HIGH findings — one fixed here, one open and needing a policy decision. The stack is _not_ ready to
merge until the open HIGH is decided and the merge preconditions at the bottom are met.**

## Stack truth
| PR | head | base | migrations |
|---|---|---|---|
| #27 | `ef8a5ec` | `main` | none |
| #28 | `be003fc` | #27 | 120000, 120100, 120200 |
| #29 | `3c84dea` | #28 | 120300, 120400 |
| #30 | `51f9cd3` | #29 | 120500 |
| #31 | `45a1d35` | #30 | 120600 |
| #32 | `c52d59f` | #31 | none |
| this PR | — | #32 | 120700 (review fixes) |

Linear, no merges from `main`, local = remote, all `MERGEABLE/CLEAN`. **CI truth:** the GitHub Actions job (typecheck, lint,
test, build) ran **only on #27** (it triggers on PRs to `main`); #28–#32 have only Vercel previews (pass) and
"Supabase Preview: skipping". No migration or DB suite has ever run in CI.

## Findings

| # | Sev | Where | Finding | Status |
|---|---|---|---|---|
| H1 | **HIGH** | #30 (`passport_revoke_consent`, gateway RPCs) | **Consent is not evaluated at the point of use for capture requests.** A subject revokes (or the grant expires); the capture request stays open ≤14 days; the gateway keeps serving it and ingesting evidence about the subject. *Repro R05: after revoke, status=`requested`, ingest `ok=true`, evidence +1.* Impact: personal data collected after consent withdrawal (incl. location if the request allowed it). Prereq: a normal consent-based request. | **FIXED** (migration 120700) |
| H2 | **HIGH** | #28 (`passport_can_act_as_verifier`, `passport_request_verification`) | **Verification independence is enforced per *account*, not per *control*.** Any user can create an org (`orgs_owner_manage`), assign a second account `evidence_reviewer`, and verify their own claim "as" that org. *Repro R09c/e: claim → `verified`, `organizations.verified=false`.* The public "why" page then says "Verified by <org name>". Direct self-verification (R09a/b/d) **is** blocked. Exploitable via the API by any signed-in user; no UI path exists today. Peer-attestation by a sock-puppet account is inherent and cannot be stopped in SQL. | **OPEN — `BLOCKED_REQUIRES_SCHEMA_AUTHORIZATION`** (policy + function change) |
| M1 | MEDIUM | #28 (`passport_claims_read`, anon `SELECT`) | **The public projection is enforced only in the app layer.** `anon` can read the *raw* row of any public claim: `source_ref` (`activity_participants:<uuid>`), `issuer_id` (the host's profile id), `created_by`, full `value`. The explanation RPC deliberately hides `source_ref` and person-issuer labels from the public — the table exposes them. *Repro R04a.* | **OPEN — `BLOCKED_REQUIRES_SCHEMA_AUTHORIZATION`** (RLS/column privilege) |
| M2 | MEDIUM | #30 (`passport_capture_related_ok`) | `SECURITY DEFINER`, arbitrary subject id, executable by any signed-in user: an oracle for "did person P apply to / attend / join X?". *Repro R01.* Prereq: know P's and X's UUIDs. | **FIXED** (revoked from `authenticated`) |
| M3 | MEDIUM (latent) | #30 (`passport_gateway_get_capture_request`, `report_capture_status`) | **Capture requests are not bound to a producer.** Any gateway client holding the scope can read or drive *any* request (`get_capture_request` takes no client id). *Repro R06a/b.* Latent: only `flow_capture` exists. **Must be fixed before a second gateway client is ever registered.** | OPEN (design decision) |
| M4 | MEDIUM | #31 (`projectClaimForPublic`) | A member can mint a claim of the platform's own type `participation.activity` (source `manual`) with any title; once "verified" (H2 / a peer) the **public list showed their text next to a verified check.** *Repro R11.* | **FIXED in app** (public projection + query trust only `flow_platform`-sourced claims). DB-level claim-type reservation is part of H2's fix. |
| M5 | MEDIUM (hardening) | #30 (`service-client.ts`) | The gateway holds `SUPABASE_SERVICE_ROLE_KEY` in the *same Next process* that serves the whole app, though it needs only `EXECUTE` on six RPCs. Compromise of any server-side code path = full database. Isolation is logical (`server-only` + one module), not physical. Recommend a dedicated Postgres role/JWT granted only those six functions. | OPEN |
| M6 | MEDIUM (process) | CI | **CI never runs `tests/db/replay.sh`.** All RLS/authorization evidence lives in the DB suites; they and the fresh-replay check gate nothing, and stacked PRs get no CI at all. Suggested job: `run: tests/db/replay.sh` on `ubuntu-latest` (Docker present). | OPEN (recommendation) |
| L1 | LOW | #30 | DB accepted `completed/cancelled/expired` from a producer (contract allows only `accepted/started/failed`): a producer could close a request with no evidence. *Repro R06c.* | **FIXED** |
| L2 | LOW | #30 (`next.ts`) | Body-size cap ran **after** `request.text()` had buffered the whole body — unauthenticated memory amplification (bounded by platform limit). | **FIXED** (`readBodyCapped`: Content-Length refusal + streaming cap) |
| L3 | LOW | #32 | The connection record's `scope` is a **fixed default** written at first contact (the RPC does not know the key's grant); the Center presented it as capability. | **FIXED** (shows "nothing permitted" when the gateway isn't configured) |
| L4 | LOW | #31 | `passport_claim_explanation` history scans the whole ledger by `refs->>'claim_id'` (no index) per owner call. | **FIXED** (additive index) |
| L5 | LOW | #30 | HMAC does not sign `client_id`/`key_id`; nonces are keyed by client. Cross-client replay is possible **only if two clients share a secret** (config parser doesn't reject that). Hardening for protocol v2. | OPEN |
| L6 | LOW | #29/#30 | The three `passport_expire_due_*` sweeps are callable by any signed-in user (*R03*). Only advances rows already past expiry; existing suites call them as a user; no exploit shown. **Deliberately not changed.** | ACCEPTED |
| L7 | LOW (by inspection, not reproduced) | #30 (`passport_capture_read`, `cancel`) | Uses the *historical* fact `requested_by = auth.uid()`: a former data_requester keeps read + cancel on requests they created. | OPEN |
| I1 | INFO | | `passport_entity_exists` existence oracle (needs unguessable ids). Concurrent truly-simultaneous duplicate delivery returns `request_not_open` rather than `duplicate` (safe: one row, one event). `getMyClaims` unbounded (owner-only). Auth-failure log lines are unbounded (log flooding). `config.ts`/`next.ts` lack `server-only`. Whether `SUPABASE_SERVICE_ROLE_KEY`/`PASSPORT_GATEWAY_CLIENTS` are set in Vercel *Preview* scope is **unverified**. | INFO |

### Pre-existing (not introduced by the stack)
* `is_blocked_between(a, b)` is `SECURITY DEFINER` and **executable by `anon` for arbitrary user pairs** — anyone can learn who blocked whom. (Reproduced R16.) Separate ticket.
* `npm audit --omit=dev`: 4 findings on `main` — **`next` 16.3.1 (2 critical, fixed in ≥16.3.3)**, `maplibre-gl` (critical XSS), `react-map-gl`, transitive `sharp` (high). The stack changed only `zod`. Not auto-upgraded; do it in a separate PR and check advisory applicability on Vercel.

### False positives investigated (and why)
* **"service_role can flip a claim to `verified` without a decision"** — my first probe's `UPDATE … WHERE status <> 'verified'` matched **zero rows** (row triggers never fire). Re-run against a real submitted claim: **blocked** (11/11 tamper attempts blocked).
* **Consent disclosure "secure" results** — first run was vacuous (my fixture was wrong, the control failed). Re-run with controls: the grantee gets a positive answer, then each denial has a *distinct correct reason* (`not_found` / `expired` / `not_active`).
* `passport_subject_is_public` as a block oracle — adds nothing beyond the pre-existing `is_blocked_between`.
* Anon `UPDATE` on the pre-existing `passport_summary` view — rejected by its existing guard.
* Anon-executable `SECURITY DEFINER` functions (`is_claim_reviewer`, `subject_owner_ok`) — caller-relative, reveal nothing about third parties.

## Invariants (A–P)
| | Result |
|---|---|
| A. can't self-assign authority by owning a record | **HOLDS** for person records (`authority_entity_mismatch`); an *org owner* may assign on their own org — by design, and the root of H2 |
| B. role/membership ≠ authority | **HOLDS** (org admin-*role* member sees 0 connections; authority read live) |
| C. connector can do only what its scope allows | **HOLDS** (scope, producer and route checks mutation-tested) — but see M3 |
| D. evidence submission ≠ verification | **HOLDS** (`received`, receipt says `verification: none`, no claim created) |
| E. revoked consent can't authorize | disclosure **HOLDS**; capture path was **BROKEN → FIXED** (H1) |
| F. private claim can't leak via projection/explanation/events/history | **HOLDS** for private claims; public claims over-expose columns (M1) |
| G. subject can't rewrite provenance | **HOLDS** (no client write grants; even `service_role` blocked by triggers) |
| H. replay protection under concurrency | **HOLDS** (30 parallel consumers → exactly 1 winner) |
| I. idempotency can't substitute a payload | **HOLDS** (conflict + 12-way concurrency → 1 row, 1 event) |
| J/K. health can't turn healthy without real contact; failures don't refresh success | **HOLDS** — an *authenticated, successful* call (even a read) is contact by definition; unauthenticated and failed calls never touch `last_success_at` |
| L. service key never in bundles/props | **HOLDS** (0 client chunks; only server pages + `next.ts`; `server-only`) |
| M. platform-admin visibility ≠ org authority | **HOLDS** |
| N. AAL1 admin can't reach AAL2 state | **HOLDS** (DB + page gate) |
| O. Capture "not connected" absent a row | **HOLDS** |
| P. no projection outranks canonical data | **HOLDS after M4 fix** |

## Test-quality review
* **Gateway crypto/auth tests are strong:** 9/9 mutants killed (replay, signature, body-in-signature, timestamp window, scope, producer, "receipt says verified", body cap, MAC compare).
* **Existing gateway DB suite never revoked consent *after* a request existed** — H1 sat exactly in that gap.
* **My own mutation run found two gaps in the new regression suite** (status-report path under time-expired consent; the `related_ok` re-grant) — both now covered; all six fix mutants are killed.
* **Skipped/todo hide real coverage:** 4 e2e skipped (need Docker stack), 105 integration `todo` (no staging Supabase). The DB suites are the *only* RLS evidence and are not in CI (M6).
* **Source-scan tests** (e.g. "never imports the service client") prove structure, not behaviour; they are backed by the bundle scan above.

## Merge preconditions (in order)
1. **Verify the Supabase↔GitHub integration does NOT auto-apply migrations on merge to `main`.** The repo has a "Supabase Preview" check, i.e. the integration is installed; if "deploy to production on merge" is on, merging #28 would run migrations against production.
2. **Do not use a naive `supabase db push`.** Three pre-stack files carry versions that differ from production (same content, applied under other timestamps): `20260823232600_creative_project_invite_consent` (live `20260823234842`), `20260824230000_verifications_application_reference` (live `20260825032951`), `20260826020000_activities_foundation` (live `20260918011342`); plus a cosmetic name mismatch on `20260823145545`. A push would treat them as unapplied. Reconcile with `supabase migration repair` (not by rewriting history). Ordering itself is deterministic: production's last version (`20260918011342`) sorts before the stack's first (`20260919120000`).
3. Decide **H2** (and M1) before merging #28 — they are in #28's migrations, which are unapplied and cheapest to change now.
4. Merge #27 → #28 → #29 → #30 → #31 → #32 → this fix PR, re-running CI (and the DB replay) as each base changes. Production migration application needs explicit authorization.

## Recommended fixes for the open items (not implemented — need a decision)
* **H2:** require `organizations.verified = true` for org-backed methods in `passport_can_act_as_verifier`; refuse a verifier org whose `owner_id` equals the claim subject's owner; reserve platform claim types (`participation.*`) so only `passport_claim_from_activity` can create them.
* **M1:** stop granting `anon` `SELECT` on the base table; serve public claims through a definer view/RPC that returns only `id, claim_type, effective_at, expires_at` (+ allow-listed value fields).
* **M3:** add `connector_key` to `passport_capture_requests` (default `flow_capture`) and pass/check `p_client` in `get/report/ingest`.
* **M5:** dedicated gateway Postgres role with `EXECUTE` on the six `passport_gateway_*` functions only.
* **L5:** sign `client_id`/`key_id` in protocol v2; reject duplicate secrets across entries in `parseGatewayClients`.
