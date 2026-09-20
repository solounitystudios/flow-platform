# Passport ↔ Flow Capture — Integration Contract

**Status: implemented and end-to-end verified on the Flow Platform side.**
Flow Creative Capture (the client) is **not implemented yet** — see
[PASSPORT_CAPTURE_HANDOFF.md](./PASSPORT_CAPTURE_HANDOFF.md).

Flow Capture is an **evidence producer**. Flow Passport is the **evidence +
claim authority**. Capture receives a bounded `CaptureRequest`, performs a
capture, and returns an `EvidencePackage`. **Receiving a package never verifies
anything** — it records unverified evidence and Passport decides what happens
next.

```
Flow (subject or authorized entity) ──create──> CaptureRequest   [Flow-side RPC, user session]
Capture ──GET /capture-requests/{id}──────────> reads the request
Capture ──POST /capture-requests/{id}/status──> accepted | started | failed
Capture ──POST /evidence-packages─────────────> EvidencePackage  ──> evidence (status: received)
Capture ──GET /evidence/{id}──────────────────> metadata-only summary of what it delivered
```

Capture **cannot create** capture requests. A request is about a subject; only
the subject (or an entity holding an active, purpose-bound consent grant from
them plus an explicit `data_requester` authority) may originate one, and that
happens inside Flow. Capture only reads and reports.

## Where the source of truth lives

| Thing | Source of truth |
|---|---|
| Wire types + zod validators | `packages/passport-contracts/src/` (`capture.ts`, `errors.ts`, `signing.ts`) |
| JSON Schema (non-TS consumers) | `packages/passport-contracts/schemas/*.schema.json` — **generated** from the zod source; a test fails on drift |
| Rules the gateway enforces | `supabase/migrations/20260919120500_passport_v2_capture_gateway.sql` (`passport_gateway_*` RPCs) |
| Handler behaviour | `lib/passport/gateway/` |

Capture must take the contract **from the package** (or the generated schemas) —
never a hand-copied duplicate. See the package README for the distribution path.

## Endpoints

Base path: **`/api/passport/v2`** (not `/passport/v2`: `/passport` is an
auth-protected application prefix and would redirect a service call to
`/login`).

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/capture-requests/{id}` | `capture_requests:read` | Read the request Capture was asked to fulfil |
| POST | `/capture-requests/{id}/status` | `capture_requests:report` | Report `accepted`, `started` (needs `capture_session_id`) or `failed` (needs `reason_code`) |
| POST | `/evidence-packages` | `evidence_packages:write` | Deliver the `EvidencePackage` |
| GET | `/evidence/{id}` | `evidence:read` | Metadata-only summary of evidence **this client** delivered |

Capture may report only `accepted`, `started`, `failed`. `completed` is set
solely by delivering a package that passes every check; `cancelled` and
`expired` are driven by Flow/time. A request need not pass through every state —
`requested → completed` is legal if Capture never reported `accepted`/`started`.

## Authentication — HMAC request signing (`v1`)

Every request carries five headers:

| Header | Value |
|---|---|
| `x-flow-client-id` | `flow_capture` |
| `x-flow-key-id` | key id from the shared registry (enables rotation) |
| `x-flow-timestamp` | Unix seconds |
| `x-flow-nonce` | 16–64 chars `[A-Za-z0-9_-]`, **single use** |
| `x-flow-signature` | `v1=` + hex `HMAC-SHA256(secret, canonical)` |

```
canonical = METHOD \n PATH?QUERY \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY)
```

* The body hash covers the exact bytes sent (empty string for `GET`).
* Timestamp must be within ±300 s of the server clock.
* A nonce can be used once per client; a replay of an identical signed request
  is `409 replayed_request`. **Generate a fresh nonce for every attempt,
  including retries** — idempotency (below) is what makes a retry safe, not
  nonce reuse.
* Use `signRequest()` from `@flow/passport-contracts` — do not re-implement it.
* Every authentication failure is the same `401 unauthorized` (the response never
  says whether the client, key, timestamp or signature was wrong; the server
  log records the internal reason).

Configuration (deployment only, **never committed**): the Passport side reads
`PASSPORT_GATEWAY_CLIENTS` (JSON array of `{client_id, key_id, secret ≥32 chars,
scopes[], status}`) and `SUPABASE_SERVICE_ROLE_KEY`. Without both, every call is
`503 not_configured`. **Rotation:** add a second key for the client (new
`active`, old `retiring`), move Capture to the new key, then set the old one
`disabled`.

## Versioning

Every message carries `schema_version` (`"<major>.<minor>"`, currently `1.0`).
Additive changes bump minor: receivers accept any minor of a supported major and
**ignore fields they don't know**. A breaking change bumps major; an unsupported
major is `422 unsupported_schema_version`. Capture should therefore also ignore
unknown fields in Passport's responses.

## Idempotency

| Delivery | Identity | Same key + same content | Same key + different content |
|---|---|---|---|
| Evidence package | `(client, idempotency_key)` **and** `(client, package_id)` | `200`, `duplicate: true`, the **same** `evidence_id` | `409 idempotency_conflict` |
| Status report | `(client, idempotency_key)` | `200`, `duplicate: true`, no state change, no extra audit event | `409 idempotency_conflict` |

Content is fingerprinted **excluding** `idempotency_key` and `correlation_id`, so
re-sending the same package under a new key is still recognised as the same
package (never a second record). Duplicates never write additional audit events.

## What Passport checks on a package (all in the database, in one transaction)

1. The capture request exists (`404 unknown_capture_request`).
2. It is open and unexpired (`409 request_not_open`, `410 request_expired` — an
   overdue request is flipped to `expired` and audited).
3. `subject` equals the request's subject (`422 subject_mismatch`).
4. `location` only if the request's `location_policy` is `optional`
   (`422 location_not_permitted`); `operator` only if `operator_identity_policy`
   is `optional` (`422 operator_not_permitted`). There is no way to *require*
   location.
5. Every key in the request's `required_metadata` is present in `source_metadata`
   (`422 metadata_missing`).
6. Artifacts are references to Capture-hosted objects (`storage.provider` must be
   `flow_capture`), of the requested kind (or `other`), with no inline `data:`
   payloads (`422 invalid_schema`). If `integrity.artifacts_digest` is supplied it
   must equal `computeArtifactsDigest(artifacts)` (`422 integrity_mismatch`).

Then it records **one evidence row** (`source_kind: capture`, `status:
received`), marks the request `completed`, and writes `evidence.created` +
`capture.completed`. Credential-document and location-bearing evidence is stored
`sensitive`. **No claim is created and nothing is verified.** The receipt says so:

```json
{
  "schema_version": "1.0",
  "package_id": "…", "evidence_id": "…", "capture_request_id": "…",
  "duplicate": false,
  "evidence_status": "received",
  "verification": "none",
  "received_at": "…"
}
```

## Errors

`{"error":{"code","message","retryable","correlation_id"}}`. Retry only when
`retryable` is true (`rate_limited`, `not_configured`, `internal_error`) — with
the **same** idempotency key and content, a **new** nonce and timestamp. Every
other code means the identical request can never succeed. Messages name failing
fields, never submitted values.

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_request` | 400 | Not JSON / not an object / malformed id |
| `unauthorized` | 401 | Authentication failed (deliberately uninformative) |
| `forbidden_scope` | 403 | Key lacks the route's scope, or `producer` ≠ authenticated client |
| `unknown_capture_request` / `unknown_evidence` | 404 | |
| `request_not_open` / `invalid_transition` / `replayed_request` / `idempotency_conflict` | 409 | |
| `request_expired` | 410 | |
| `payload_too_large` | 413 | Body over 1 MB (packages carry references, not media) |
| `invalid_schema` / `unsupported_schema_version` / `subject_mismatch` / `location_not_permitted` / `operator_not_permitted` / `metadata_missing` / `integrity_mismatch` | 422 | |
| `internal_error` | 500 | retryable |
| `not_configured` | 503 | retryable |

## Connection health (Connections Center foundation)

Each authenticated exchange updates one platform-level `IntegrationConnection`
(`connector_key: flow_capture`): success → `healthy`; data Passport can't accept
→ `error` with `last_error_category` `schema` / `rejected`. Ordinary business
outcomes (an expired request, an unknown id) are **not** failures. Only
*authenticated* traffic can change recorded health, so an unauthenticated caller
can never degrade it. Silence reads as `stale` (no success within
`stale_after_seconds`, default 7 days) — computed at read time. A stale or
disconnected source means Passport data is **stale**, never **false**. Events:
`integration.connected|degraded|disconnected|sync_failed`, visible to AAL2 admins.

## Verification performed

* `tests/db/passport_v2_capture_gateway.test.sql` — every rule above against real SQL,
  impersonating `anon` / `authenticated` / `service_role`.
* `tests/unit/passport-gateway.test.ts` — 45 tests over the real handler (auth, replay,
  scope, version/schema, error mapping, receipts, health bookkeeping, no secret leakage);
  mutation-checked.
* `tests/e2e/run-gateway-e2e.sh` — signed HTTP → real Next server → service-role client →
  PostgREST → migrated Postgres (duplicate delivery, conflict, replay, wrong subject,
  health recovery, unsigned traffic not touching the nonce ledger).
