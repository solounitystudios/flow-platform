# FLOW Multi-Agent Orchestration — Shared Rules

This document governs every agent under `.claude/agents/` for the FLOW platform.
It is imported into every session via `CLAUDE.md` and applies regardless of
which agent (or no agent) is active. Individual agent files may add
domain-specific detail; they may never relax anything stated here.

## What this system is — and isn't

This is a set of **project-level Claude Code subagent definitions** that let a
coordinating session (`flow-lead`) delegate FLOW development work to
specialists with narrower context and tool access. It exists to reduce manual
founder intervention on well-scoped, reviewable batches of work.

It is **not** a standing service. Agents only run inside an active Claude Code
session. Nothing here continues executing after a Codespace/session ends, and
nothing here is a cron job, daemon, or autonomous background process unless a
real scheduling mechanism (e.g. the `schedule`/`loop` skills, or a CI workflow)
is separately and explicitly configured. Do not describe or imply otherwise to
the founder.

## Ownership map

Each specialist agent "owns" a slice of the repo — the area it should make
changes in without checking in, and the area other agents should defer to it
on. Ownership is about *primary responsibility*, not an exclusive lock:
`flow-lead` can still ask any agent to touch any file when a task genuinely
crosses boundaries, but the owning agent should be the one asked first.

| Agent | Owns |
|---|---|
| `supabase-backend` | `supabase/migrations/**`, RLS policies, RPC/DB functions, triggers, storage policies, `lib/database.types.ts` (generation), `lib/supabase/**` |
| `admin-control-center` | `app/admin/**`, `components/admin/**`, `lib/admin/**` |
| `jobs-opportunities` | `app/(app)/gigs/**`, `app/(app)/work/**`, `app/(app)/business/opportunities/**`, `app/(app)/business/post/**`, `lib/data/opportunities.ts`, `lib/opportunity-filters.ts`, `lib/work.ts`, `components/opportunities/**`, `components/business/PostOpportunityForm.tsx` |
| `events` | `app/(app)/events/**`, `app/(app)/business/events/**`, `app/(app)/tickets/**`, `lib/data/events.ts`, `components/events/**` |
| `passport-reputation` | `app/(app)/passport/**`, `app/(app)/recommendations/**`, `app/p/[username]/**`, `app/(app)/creative-projects/**`, `lib/passport.ts`, `lib/verification-actions.ts`, `lib/intent-actions.ts`, `lib/intent-constants.ts`, `lib/creative-project-actions.ts`, `lib/creative-project-display.ts`, `lib/data/creative-projects.ts`, `components/passport/**`, `components/recommendations/**`, `components/creative-projects/**` |
| `map-discovery` | `app/(app)/live/**`, `app/(app)/discover/**`, `app/(app)/search/**`, `lib/data/discover.ts`, `components/search/**`, `components/opportunities/LiveMap.tsx` |
| `employer-business` | `app/(app)/business/**` (shell/dashboard), `app/employer/**`, organization profile/verification UI |
| `payments-commerce` | `app/(app)/rewards/**`, `components/rewards/**`, `lib/data/rewards.ts`, points/ledger/redemption UI, future payment/membership architecture |
| `frontend-product` | `components/ui/**`, `components/nav/**`, `app/layout.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/globals.css`, `tailwind.config.ts`, shared loading/empty/error patterns |
| `qa-security` | no code ownership — cross-cutting review only |
| `schema-auditor` | no code ownership — cross-cutting comparison/report only |
| `release-manager` | no code ownership — cross-cutting git/release coordination only |
| `flow-lead` | no direct code ownership — orchestration only |

`lib/data/gap.ts` (skill-gap analysis) sits between `jobs-opportunities` and
`passport-reputation` — either may propose changes, but `flow-lead` must
confirm the other isn't mid-edit before either touches it.

Creative Projects (`app/(app)/creative-projects/**`, `components/creative-projects/**`,
`lib/creative-project-actions.ts`, `lib/creative-project-display.ts`,
`lib/data/creative-projects.ts`) is owned by `passport-reputation`: the domain's
entire reason for existing is to feed the verification/evidence witness
pipeline `passport-reputation` already owns (see PR #15's Creative-Project-linked
verification work) — folding it in there was the smallest ownership fix, and no
dedicated agent is currently justified by its size or by any use outside
Passport verification. Revisit only if Creative Projects grows a purpose
genuinely independent of Passport (e.g. becomes its own discovery/marketplace
surface).

### Files everyone shares — coordinate before touching

These files are read and depended on by nearly every agent. `flow-lead` must
serialize edits to them — never let two delegated agents modify one of these
in the same batch without an explicit handoff:

`lib/database.types.ts`, `lib/types.ts`, `lib/actions.ts`, `lib/authz.ts`,
`lib/admin/auth.ts`, `lib/demo.ts`, `lib/utils.ts`, `components/ui/*` primitives, `app/layout.tsx`,
`proxy.ts` (middleware), `package.json`, `tailwind.config.ts`, `CLAUDE.md`,
`AGENTS.md` (auto-regenerated by `next dev` — never hand-edit it; extend
`CLAUDE.md`'s imports instead).

## Supabase safety rules

- `supabase-backend` is the only agent that writes migrations or applies
  schema changes. Every other agent that needs a schema change must request
  it from `supabase-backend` rather than writing SQL itself.
- Prefer **additive, backwards-compatible migrations**: new tables, new
  nullable/defaulted columns, new indexes, new policies. Renaming or dropping
  a column/table, tightening a constraint on existing rows, or any `DROP`/
  `TRUNCATE`/`DELETE` against production data requires **explicit human
  authorization in the current session** — stating the plan and getting a
  yes/no before running it, every time, not just the first time.
- Never run destructive SQL, `supabase db reset`, or anything that resets or
  overwrites production Supabase data. If a task seems to require it, stop
  and ask the founder instead of finding a workaround.
- New RLS policies default to the most restrictive shape that still serves
  the real caller (mirror the patterns already established: owner-or-admin
  reads, `SECURITY DEFINER` RPCs with fixed `search_path` for anything that
  needs to bypass RLS, admin checks via `is_flow_admin()`/AAL2 where the repo
  already does that for similar operations).
- Every schema change ships with the migration file committed under
  `supabase/migrations/` *and* a regenerated `lib/database.types.ts` in the
  same batch — never one without the other.

## Verified baseline facts (do not rediscover)

These were independently re-verified against live repo/Supabase state during
the 2026-08-24 governance reconciliation, after two prior audits gave
conflicting numbers. Treat the figures below as canonical; re-verify only if
the underlying code/schema actually changes.

- **Work Now.** V1 is not a dedicated standalone product surface: no
  dedicated route exists, and no persistent Work Now table or column exists
  in the schema. "Urgent"/Work Now status is computed on read from existing
  `opportunities` data (`lib/data/opportunities.ts`). That computed state is,
  however, already wired into real map layer, filter, badge, and dashboard
  behavior across the app — it is not a stub. "Work Now V2" means expanding
  the product surface/behavior (e.g. a standalone route, persistence,
  notifications), not repairing a broken database feature.
- **Integration tests.** `tests/integration/` has 3 files and exactly 76
  `it.todo`/`describe.todo` cases, 0 of which currently execute. The blocker
  is that no staging Supabase project exists yet for them to run against.
  This is a known, pre-existing gap — not a regression — and is out of scope
  to fix incidentally.
- **Migration drift.** Two live migrations have verified drift from their
  repo filenames, both content/functionality-identical to the repo source
  (confirmed by direct comparison of live object definitions):
  `20260823145545_verifications_creative_project_reference` has a cosmetic
  live metadata/name-field mismatch only (version matches) — no repair
  required; `20260823232600_creative_project_invite_consent` has a live
  recorded version that differs from the repo filename's timestamp — SQL
  content matches, non-blocking, deferred to `supabase-backend` as routine
  hygiene.
- **`public.passport_summary`.** Confirmed as a known, intentional
  `SECURITY DEFINER` pattern (flagged by Supabase's advisor, which
  pattern-matches on `security_invoker=false` with no analysis of intent).
  Direct comparison verified the view's own `WHERE` clause correctly
  preserves the owner/admin/`public_passport`/block-check gating the base
  tables' RLS would otherwise provide. No active privacy bypass was found.
  Treat as an accepted advisor exception unless the view's implementation
  changes.

## General safety rules (all agents)

- **No destructive commands without explicit authorization** — this covers
  `git reset --hard`, `git clean -f`, `rm -rf`, force-deleting branches,
  overwriting uncommitted work, and any Supabase destructive operation.
- **No force pushes**, ever, to any branch, without the founder explicitly
  asking for it in that turn.
- **No direct production deployment.** No agent pushes, merges to `main`, or
  triggers a deploy on its own — that is `release-manager`'s job to *prepare*,
  and even `release-manager` stops short of doing it without explicit
  human authorization.
- **No secrets committed.** Never write real API keys, service-role keys, or
  credentials into a tracked file. `.env.local` stays gitignored; only
  `.env.example` (placeholders) is tracked.
- **Preserve backwards compatibility** where reasonably possible — don't
  break an existing working route, RLS policy, or data shape to make a new
  feature slightly cleaner.
- **All major batches end in build/typecheck/test.** Before any agent (or
  `flow-lead`) reports a batch of work as done, `npm run build`,
  `npm run typecheck`, and `npm run lint` must have actually been run in that
  session, and their results reported honestly — not assumed, not skipped.
  (There is currently no automated test suite in this repo — see
  `schema-auditor`'s standing finding — so "tests" currently means the
  verification commands above plus any manual route checks `qa-security`
  performs.)
- **Incomplete work must be reported, not hidden.** If a task can't be
  finished, or a fix is partial, or a known gap remains, say so plainly in
  the final report. Never claim something is done when it isn't.
- **Do not rebuild or re-architect** working FLOW systems to satisfy a new
  request unless you've first shown the existing approach can't reasonably be
  extended. Reuse existing patterns (the codebase already has strong
  conventions — mirror them, don't invent parallel ones).
- **Single-writer session rule.** Only one interactive session may have
  write authority over `/workspaces/flow-platform` at a time. Additional
  sessions may audit and read freely, but must not edit, branch, commit,
  merge, reset, or otherwise switch shared checkout state without an
  explicit handoff from whichever session currently holds write authority.

## Conflict prevention

`flow-lead` is responsible for sequencing, not any individual specialist:
1. Before delegating, check whether the task touches a shared file (above) or
   another agent's owned area.
2. If two tasks in the same batch would touch the same file, run them
   sequentially, not in parallel — brief the second agent on what the first
   one just changed.
3. If an agent discovers mid-task that it needs to modify a file outside its
   ownership, it should stop and report that back to `flow-lead` rather than
   proceeding unilaterally.

See `.claude/FLOW_WORKFLOW.md` for the end-to-end request flow these rules
operate inside of.

## Status reporting (FLOW COMMAND)

`.claude/flow-command-state.json` is the data source for the founder-facing
FLOW COMMAND dashboard at `/admin/command`. It contains no secrets — it is
safe to read from a Next.js Server Component and safe to have committed.

`flow-lead` owns this file and should update it at meaningful milestones
only, not on every tool call:

- mission start (new `mission`, reset `checkpoints`, `agents` set to
  `STANDBY`/`WORKING` as appropriate)
- each agent delegation (that agent's `status`, `current_task`,
  `waiting_on`)
- a meaningful checkpoint completing (advance `checkpoints[].status` and
  `phase`)
- a blocker appearing (`blockers`, and the relevant agent's `status` set to
  `BLOCKED`)
- QA starting and QA PASS/FAIL (`qa_status`)
- the release-check gate (`checkpoints` entry for "Release Check")
- entering the founder-approval wait (`founder_approval_required: true`)
- mission complete (`checkpoints` all `done`, `last_completed_mission`
  populated, `production_touched` and `pushed` stated honestly)

Never write a status this file can't actually support — `production_touched`
must reflect a real check (e.g. no `apply_migration`/write `execute_sql` call
was made), not an assumption. `usage_mode` is manually reported, never
inferred from anything resembling real telemetry — see the field's own
`usage_mode_note` for why. If a field can't be determined honestly, leave it
`null`/`pending` rather than guessing.

This file must not go stale across merges: whichever of `flow-lead` or
`release-manager` closes out a product batch is responsible for updating
`.claude/flow-command-state.json` so it reflects the actual latest merge to
`main` before the next batch begins — don't leave a prior mission's record
standing once further PRs have merged past it. If this file and Git/GitHub
history ever disagree, Git/GitHub history is the source of truth; treat the
file as a convenience cache for the dashboard, not the record of record.
