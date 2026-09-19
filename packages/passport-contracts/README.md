# @flow/passport-contracts

Versioned **wire contracts** for FLOW Passport Core: subject refs, claims,
evidence, verification, consent, authority, relationships, the event
vocabulary, integration health, and the Flow Platform ↔ Flow Capture messages
(`CaptureRequest`, `EvidencePackage`, receipts, gateway errors) plus the
request-signing protocol both sides use.

## What it is / isn't

**Contains:** TypeScript types, zod runtime validators, generated JSON Schema,
WebCrypto-based hashing/signing helpers.

**Must never contain:** database access, Flow UI, Capture implementation,
verification decisions, organization business logic. Enforced by
`tests/unit/passport-contracts.test.ts` (imports may only be `zod` and
sibling modules).

## Single source of truth

The zod schemas in `src/` are the source. `schemas/*.schema.json` are
**generated** from them (`npm run contracts:schemas`) and a test fails when
they drift, so the TypeScript types, the runtime validators and the JSON
Schema a non-TypeScript consumer reads cannot diverge. Never hand-edit
`schemas/`.

## Versioning

Every cross-repo message carries `schema_version` (`"<major>.<minor>"`).
Additive change → bump minor; receivers accept any minor of a supported major
and ignore unknown fields. Breaking change → bump major; receivers reject
unsupported majors with `unsupported_schema_version`. See `src/version.ts`.

## Distribution

Today this repo has no npm workspace or private registry, so the package is
consumed **in place** by Flow Platform through a `tsconfig`/`vitest` path
alias (`@flow/passport-contracts` → `packages/passport-contracts/src`).
It ships as TypeScript source (no build step), so there is nothing to keep in
sync.

For **Flow Creative Capture** the intended path, in order of preference:

1. Publish `@flow/passport-contracts` to the org's private registry
   (`npm publish` from this directory — it is `private: true` until a
   registry exists) and depend on it by version.
2. Until then, Capture installs a packed tarball produced from this exact
   directory (`npm pack`) — never a hand-copied source tree.
3. A consumer that isn't TypeScript uses `schemas/*.schema.json` directly.

Whichever is used, Capture must take the contract **from here**; a second
maintained copy is a defect.
