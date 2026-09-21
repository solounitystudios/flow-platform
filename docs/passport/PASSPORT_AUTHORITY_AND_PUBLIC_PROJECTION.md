# Passport V2 — organization-control authority and the public projection

Two invariants the rest of Passport V2 relies on. Both are enforced **in the database**, so every caller
(route handler, server action, gateway, direct PostgREST call) inherits them. Tests: see [Where it is proven](#where-it-is-proven).

---

## 1. Organization-control authority (H2)

**Invariant.** No verification, claim or derived Passport state may represent organization authority unless, at
the moment the authority is exercised, the actor holds live authority for *that* organization, *that* operation and
*that* scope, **and** the verifying party is independent of whoever controls the claim's subject. Fail closed.

### The two questions, and their sources

| Question | Canonical source | Where |
|---|---|---|
| *May this actor decide for this organization?* — **authority** | `passport_authority_assignments` via `passport_has_authority()` / `passport_can_act_as_verifier()` | `20260919120000` / `…0100` |
| *Is the verifier independent of the subject?* — **independence** | the **control set** of each side, via `passport_org_controllers()` → `passport_controls()` → `passport_verifier_independent()` | `20260919120100` |

Ownership of a record proves *ownership*, not review rights. `owner` authority is derived, never assigned; every
other authority is an explicit, scoped, expiring assignment.

### What counts as control of an organization

The union of (established repo semantics, not invented here — see the comment block above `passport_org_controllers`):

1. `organizations.owner_id`;
2. an **active** `organization_members` row with role `owner` or `admin` (the set the legacy verification path lets resolve a verification for the org);
3. any principal holding an **active, started, unexpired** Passport authority assignment on the organization.

An ordinary member (recruiter, manager, invited, suspended, removed) is **not** control: an employee is exactly who
an employer verifies. If `organization_members` ever grants a lower role management power, add it in
`passport_org_controllers()` — it is the single place that decides.

Independence is decided over **sets of accounts, not user ids**: a person cannot be verified by an organization any
of whose controllers also controls the subject (a person, an organization, an event, an activity or a project).
`business` is folded to `organization` first so an alias cannot dodge a check.

### Where it is checked (defence in depth)

1. **`passport_request_verification`** — refuses `verifier_not_independent`, and `verifier_not_verified` unless `organizations.verified` is set. **Known gap (QA F1):** the trigger protecting that flag fires on `UPDATE` only, so an organization created with `verified = true` on `INSERT` satisfies this check; see Known limits.
2. **`passport_record_verification`** — **re-evaluates both at decision time**, plus that the decider does not control the subject. Control and organization trust can change between a request and its decision; nothing is trusted from request time.
3. **`passport_claims` guard trigger** — refuses a transition to `verified` unless a completed decision exists that is independent and, for organizations, FLOW-verified. A privileged writer or a future careless RPC cannot skip 1–2.

### Fail-closed and revocation semantics

* Authority is read from the table on **every call** (STABLE SQL, no caching). A committed revocation is visible to an already-open connection immediately; expired and not-yet-started assignments confer nothing, with no sweep needed.
* A refusal creates no verification row and does not move the claim. A caller who is not the named party gets `not_authorized` or `not_found` (QA F4: the two are distinguishable for random ids, so this is not a perfect existence-oracle defence).
* A decided verification is immutable and cannot be decided again (`not_pending`). Concurrent decisions serialize on the claim row: exactly one wins.

### Scope semantics

An assignment carries `claim_type_prefixes` (matched on a **dot boundary**, so `credential.license` does not match `credential.licensed`) and `purposes`. An empty scope is refused at assignment time. Authority for organization A never carries to organization B, and one authority type never implies another.

### Trusted boundary

The four control helpers are executable by `service_role` only (never `anon`, `authenticated` or `PUBLIC`). `service_role` has no `auth.uid()`, so it cannot decide an organization verification through the RPC. Every Passport `SECURITY DEFINER` function pins `search_path`.

---

## 2. The canonical public Passport projection (M1)

**Invariant.** `PUBLIC PASSPORT ≠ RAW PASSPORT RECORD.` Row-level security cannot hide columns, so the raw tables
are never the public API. `anon` holds **no privilege at all** on any `passport_*` table, and a signed-in stranger
receives **no more than `anon`**.

### The four representations

| Representation | Who | Served by | Shape |
|---|---|---|---|
| **Public** | anyone (`anon` or signed-in stranger) | `passport_public_claims()`; `passport_claim_explanation()` (public branch) | allow-list, below |
| **Owner / private** | the subject | RLS on the raw tables; explanation `owner` branch | the full canonical row, own evidence, own history |
| **Selectively disclosed** | a grantee's authorized principal, under a live grant | `passport_disclose()` | a yes/no **answer** + expiry — never a claim, value, issuer or evidence |
| **Admin / verifier internal** | AAL2 admin; a reviewer for the one claim they were asked to decide | RLS + explanation `admin` / `reviewer` branches | raw claim, verification internals, ledger (admin); one claim + evidence metadata (reviewer) |

### Public allow-list

`passport_public_claims(profile_id | claim_id)` returns **exactly** `id, claim_type, effective_at, expires_at, public_value` and
only for claims that are all of: `visibility = public`, `status = verified`, unexpired, `sensitivity = standard`,
`source_system = flow_platform` (Passport-derived — a member can author a claim of any type, and a verified check
beside their own text would be a forgery), of a person whose Passport is public and who has not blocked the viewer.
It never lists across people (a profile or claim id is required) and is capped at 50 rows.

`public_value` is built by `passport_public_claim_value()` **from an allow-list per claim type, default deny**:
`participation.activity` → `title`, `activity_type` only (length-capped, type-checked); every other type → `{}`.
The TypeScript mirror is `PUBLIC_VALUE_FIELDS` in `lib/passport/domain/projections.ts` (parity-tested); the data
layer additionally zod-validates and **strips** anything the database might over-return.

The public **explanation** is a second public surface with its own reviewed shape. For a public viewer it returns:
`claim` {id, claim_type, subject {type,id}, status, effective_status, effective_at, expires_at, visibility, created_at;
`sensitivity` and `status_reason_code` present as `null`}, `source` {system; `ref` `null`}, `issuer` {kind, entity_type,
label — an **organization's** name only}, `verification` {method, verifier {kind, label — an organization's name or "Flow";
a person is unnamed}, decided_at, expires_at; `reason_code` `null`}, `evidence` {count}, and empty `pending_verifications`
and `history`. Hidden claims answer exactly like nonexistent ones.

### Field classification

| Class | Fields |
|---|---|
| **A — intentionally public** | the projection row above; the public-explanation fields above |
| **B — selectively disclosable** | the *answer* to `claim_valid` / `credential_held`, its `expires_at`, `evaluated_at`, `grant_id` — only under an active, unexpired grant covering the category |
| **C — authenticated-only** | none for claim data (a stranger equals `anon`) |
| **D — owner-only** | raw `value`, `source_ref`, `issuer_*`, `created_by`, `status_reason_code`, `sensitivity`, own evidence and its metadata, own history and pending requests, consent grants about them |
| **E — verifier / admin / internal** | verification rows and reason codes, authority assignments, the ledger (`passport_events`), capture requests, integration connections, person-verifier names, evidence metadata for a reviewer |
| **F — never publicly exposable** | artifact storage references, evidence provenance and integrity hashes, `revocation_context`, gateway nonces / signatures, service-role material |

### Changing the public surface

Adding a field to the public projection is a **deliberate disclosure**: extend the allow-list in *both* SQL and
TypeScript, then update the pinned expected key sets in `tests/db/passport_v2_m1_public_projection.test.sql` (M1-01,
M1-13). Adding a column to a table, a key to `value`, or a claim type changes nothing publicly on its own (M1-05, M1-08).
A new function or view that returns claim data and is left executable by `anon` fails M1-15 until it is reviewed.

---

## Where it is proven

| What | File |
|---|---|
| H2 matrix (16 cases; fails 4 on the pre-fix schema) | `tests/db/passport_v2_h2_org_control.test.sql` |
| H2 under real parallel sessions | `tests/db/h2_concurrency.sh` (run by `replay.sh`; skipped for a `KEEP=1` container unless `CONCURRENCY=1`) |
| M1 canary matrix (15 cases) | `tests/db/passport_v2_m1_public_projection.test.sql` |
| Core independence / read isolation (§11, §15, §16) | `tests/db/passport_v2_core.test.sql` |
| Explanation ↔ projection parity | `tests/db/passport_v2_explanation.test.sql` |
| Disclosure revoke / expiry at the point of use | `tests/db/passport_v2_consent_relationships.test.sql` |
| Controls fail closed (38 mutants) | `tests/db/mutation/run.py` (manual: `KEEP=1 tests/db/replay.sh`, then `tests/db/mutation/run.py <container>`) |
| TS projection / data layer | `tests/unit/passport-explanation.test.ts`, `tests/unit/passport-review.test.ts` |

## Known limits

* **OPEN — HIGH (QA F1): the "organization must be FLOW-verified" leg of H2 is bypassable.** `protect_organization_fields` is `BEFORE UPDATE` only and the owner policy is `FOR ALL`, so any signed-in user can `INSERT` an organization with `verified = true`. A second account that owns such an organization and assigns itself reviewer authority can verify another user's claim through it: control independence still holds (two accounts), but the platform-vetting requirement does not. Root cause pre-dates Passport V2; V2 trusts the flag. Reproduction: `tests/db/repros/passport_v2_qa_findings.repro.sql` (F1).
* **OPEN — MEDIUM (QA F2): a host can complete their own activity.** `passport_claim_from_activity` uses a `system` verifier, which is always independent, and `activity_participants` has no host ≠ participant rule, so one account can host, self-register, self-check-in, self-complete, claim, and publish a "Verified by Flow" claim that `anon` sees in the public projection (repro F2).
* **OPEN — LOW (QA F3):** the `passport_claims` guard trigger is `UPDATE`-only, so a privileged writer (`service_role` holds full DML on every `passport_*` table by default privileges) can `INSERT` a `verified` claim directly (repro F3).

* **Peer attestation by a second account is inherent** and cannot be stopped in SQL; independence is over *control*, not identity.
* **Platform-reserved claim types are not reserved at the DB level.** A member can create a `participation.activity` claim (source `manual`) and have it peer-verified. The public projection never shows it, but `passport_disclose('claim_valid', …)` does not filter on `source_system`, so a consented grantee can be told `answer: true`. Closing this needs a policy decision (which claim types only Passport may create); see the review addendum.
* The public explanation carries `null`-valued keys for private fields (`sensitivity`, `status_reason_code`, `source.ref`, `verification.reason_code`) because the cross-repo `ClaimExplanation` contract requires those keys. They disclose field *names* only, never values.
* CI does not run the database suites; `tests/db/replay.sh` must be run locally (Docker) until it is wired into a workflow.
