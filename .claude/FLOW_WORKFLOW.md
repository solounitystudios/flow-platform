# FLOW Development Workflow

Every non-trivial FLOW development request in this repo should flow through
these gates, in order. Trivial requests (a copy tweak, a one-line bug fix
already fully understood) don't need the ceremony — use judgment — but
anything that touches schema, RLS, admin permissions, or spans multiple
files/domains should go through the full chain.

```
REQUEST
  │
  ▼
FLOW LEAD (flow-lead)
  │   inspects repo state, understands the milestone,
  │   breaks it into dependency-aware tasks, checks for
  │   shared-file conflicts, maintains an implementation checklist
  │
  ▼
SCHEMA AUDIT (schema-auditor)  ── only when the request touches
  │                                 the database: new fields, new
  │                                 tables, changed enums, anything
  │                                 a specialist will read/write
  │                                 through Supabase
  ▼
SPECIALIST AGENT(S)
  │   supabase-backend / admin-control-center / jobs-opportunities /
  │   events / passport-reputation / map-discovery / employer-business /
  │   payments-commerce / frontend-product — whichever own the area,
  │   run sequentially if they touch shared files, in parallel if they
  │   genuinely don't
  │
  ▼
QA / SECURITY (qa-security)
  │   build / typecheck / lint, authorization + RLS spot-check,
  │   route smoke-check, regression check — PASS/FAIL with blockers
  │
  ▼
RELEASE MANAGER (release-manager)
  │   git diff review, logical commit grouping, migration summary,
  │   user-facing changelog draft — prepares, does not push
  │
  ▼
HUMAN APPROVAL
    founder reviews and explicitly authorizes commit / push / merge / deploy
```

## Gate details

**FLOW LEAD.** Always the entry point for anything beyond a trivial fix.
Reads the current repo/git state before doing anything else, confirms it
understands what "done" means for this request, and produces a short
dependency-ordered task list before delegating. Delegates rather than
implementing — see `flow-lead.md` for why this is a hard rule, not a
preference.

**SCHEMA AUDIT.** Skip this gate only when the request provably touches no
database surface (pure UI copy, client-only component work, a
frontend-product pass). Any request that adds/changes a table, column, enum,
RPC, or RLS policy — or that a specialist will need real schema context for —
goes through `schema-auditor` first so the specialist isn't guessing at what
the database actually looks like. `schema-auditor` produces a reconciliation
report; risky DB changes should not proceed until that report exists.

**SPECIALIST AGENT(S).** Do the actual implementation, scoped to their owned
area (see the ownership map in `FLOW_ORCHESTRATION.md`). Each specialist ends
its own turn with the verification commands that are reasonable for its
change — but the batch-level build/typecheck/lint pass still happens at the
QA gate regardless.

**QA / SECURITY.** Independent of whoever implemented the change. Runs the
real verification commands, checks the specific things easy to get wrong
(client-side-only admin gating, missing RLS, broken imports, missing
loading/error/empty states), and reports PASS/FAIL with a concrete blocker
list. A FAIL sends the batch back to the relevant specialist, not to a silent
fix — `qa-security` does not rewrite the feature itself.

**RELEASE MANAGER.** Only engages once QA has passed. Makes sure the diff
matches the request (nothing unrelated bundled in), groups changes into
logical commits, summarizes any migrations and user-facing changes, and
drafts documentation/changelog updates. Never pushes, merges, deploys, or
touches production — that decision belongs to the founder.

**HUMAN APPROVAL.** The founder reviews `release-manager`'s summary and
explicitly says go before anything leaves the working tree. No agent skips
this step on the founder's behalf.

## Definition of done for a delegated batch

A batch is done when, and only when:
1. The task list `flow-lead` created is fully checked off (or the remainder
   is explicitly reported as out of scope / deferred).
2. `npm run build`, `npm run typecheck`, and `npm run lint` all pass.
3. `qa-security` has reported PASS (or the founder has explicitly accepted a
   documented, non-blocking gap).
4. Nothing destructive happened to Supabase data or git history without
   explicit authorization.
5. The working tree state is clearly reported — what changed, what didn't,
   what's still open.

If any of these aren't true, the honest status is "not done yet," reported
plainly — never papered over.
