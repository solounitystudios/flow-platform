-- Creative Projects foundation (Batch 15).
--
-- Introduces the minimal, standalone data model for a member to create a
-- "creative project" and invite other FLOW members onto it as collaborators.
-- This is intentionally a bare-bones foundation, not the full Creative
-- Contributions/Studio Sessions feature set — see "Explicitly out of scope"
-- below for the hard boundary this migration does not cross.
--
-- What this migration adds, and nothing else:
--
--   1. public.creative_projects — one row per project, owned by exactly one
--      profile (`owner_id`, mirrors `organizations.owner_id`). No
--      `organization_id` column and no public-read policy: unlike
--      organizations, creative projects are never public-discoverable and
--      never org-scoped in this batch.
--
--   2. public.creative_project_members — one row per (project, profile)
--      relationship, with a role (owner/member) and a lifecycle status
--      (invited/active/suspended/removed), mirroring `organization_members`'s
--      shape closely (this repo's established pattern for "membership on top
--      of a single-owner resource"). `role = 'owner'` is reserved for the row
--      that mirrors `creative_projects.owner_id` — see point 3 — and is
--      never assignable via the invite/manage policies below. `removed` rows
--      are never deleted — see "Self-leave" below — so this table is an
--      append-only history of a profile's relationship to a project, not
--      merely a live roster.
--
--   3. sync_creative_project_owner_membership() — an AFTER INSERT trigger on
--      creative_projects that inserts the matching owner row into
--      creative_project_members automatically, so `owner_id` and
--      creative_project_members can never drift apart. No backfill is
--      needed — this table has zero existing rows.
--
--   4. is_creative_project_member(project, min_role) — a SECURITY DEFINER
--      helper, shaped exactly like is_organization_member(). It exists for
--      the same reason is_conversation_member() exists (see
--      20260819014535_fix_conversation_members_rls_recursion.sql): a read
--      policy on creative_project_members that needs to check "is the
--      caller an active member of this project" by querying
--      creative_project_members itself would trigger Postgres error 42P17
--      (infinite recursion in RLS policy evaluation) if written as a plain
--      `exists (select 1 from creative_project_members ...)` subquery
--      directly inside that table's own policy. Routing the check through a
--      SECURITY DEFINER function breaks the recursive evaluation chain.
--
--   5. leave_creative_project(project) — a narrow SECURITY DEFINER RPC that
--      is, after this revision, the *only* mutation path by which a member
--      can change their own membership row. See "Self-leave" below for why
--      this replaced an earlier draft's self-DELETE policy.
--
-- Architecture decisions (settled; implemented as directives below, not
-- re-litigated in this migration):
--
--   - Role model: `owner`/`member`, no `admin`. There is deliberately no
--     project-admin delegation in V1 — only the owner can invite/manage
--     membership or edit project metadata. `member` is purely an
--     authorization label (read access to the project + roster) and says
--     nothing about what someone creatively contributed to the project —
--     that's Contributions-batch territory, still out of scope here. A
--     delegated-admin role can be added additively later (a new allowed
--     `role` check-constraint value plus its own RLS policy) without
--     breaking any existing row, since `member` stays valid either way.
--
--   - `owner_id` (not `created_by_profile_id`): creative_projects mirrors
--     `organizations`' single-exclusive-owner authorization model
--     (`owner_id` + a membership-table RLS layer on top of it), not
--     `opportunities`/`events`' `created_by` attribution model, where
--     organization membership — not the individual row — governs management
--     authority. `owner_id` correctly signals "this column is the
--     authorization anchor," matching `organizations.owner_id`'s role in
--     this repo's conventions exactly.
--
--   - `title` (not `name`): `organizations` (an entity) uses `name`;
--     `opportunities`/`events` (content/work items with their own lifecycle)
--     use `title`. A creative project is a work item — a song, a film, a
--     creative endeavor — analogous to an opportunity/event, not an
--     organizational entity, so `title` is the convention-consistent choice.
--
--   - No project lifecycle status column in this batch. This is a
--     deliberate deferral, not an oversight: nothing in the founder-approved
--     self-leave/roster-visibility scope requires it, project access is
--     already fully governed by is_creative_project_member()/
--     creative_projects_owner_manage independent of any lifecycle state, and
--     adding active/completed/archived now would be speculative — no
--     consumer of that state exists yet. It can be added later as a new
--     nullable/defaulted column with zero migration risk.
--
-- Security model / RLS matrix (creative_projects):
--   - Owner: full access (select/insert/update/delete) via
--     creative_projects_owner_manage.
--   - Any active member (including the owner, whose own membership row is
--     synced to 'active' by the trigger): read access via
--     creative_projects_member_read. This overlap with the owner policy is
--     expected and harmless, not a bug — the owner policy still exists
--     because it's the only one that grants insert/update/delete.
--   - FLOW admin (AAL2, via is_flow_admin(true)): full access at the RLS
--     layer, but see the owner_id-immutability note below — column-level
--     UPDATE privileges restrict what "full access" can actually change,
--     for every caller including this policy, since AAL2 FLOW admin is a
--     claim evaluated for the `authenticated` Postgres role, not a separate
--     role with its own grants.
--   - No public-read policy. Creative projects are private to their
--     membership in this batch, full stop.
--   - owner_id immutability: creative_projects_owner_manage's own
--     using/with-check (auth.uid() = owner_id on both sides) already
--     structurally prevents a plain owner from transferring owner_id to
--     someone else — the post-update row would need auth.uid() to equal the
--     *new* owner_id too, so only a same-caller no-op update is possible
--     through that policy. The real gap was creative_projects_admin_all,
--     which grants is_flow_admin(true) an unrestricted UPDATE with no
--     owner_id guard: an admin could reassign owner_id directly, and since
--     sync_creative_project_owner_membership() only fires AFTER INSERT
--     (never AFTER UPDATE), the synced membership row would never re-run,
--     orphaning the owner_id/creative_project_members invariant. Closed with
--     the same column-level-privilege technique used below on
--     creative_project_members: `authenticated` (which is every RLS-gated
--     caller here, admin included) can only ever UPDATE title/description/
--     updated_at on this table — owner_id, id, and created_at are excluded
--     from the grant entirely, so no UPDATE statement naming owner_id can
--     succeed regardless of RLS policy content. Ownership transfer stays
--     explicitly out of scope/deferred — this is a pure immutability fix,
--     not a transfer mechanism.
--
-- Security model / RLS matrix (creative_project_members):
--   - Status model and its access semantics (documented explicitly, since
--     this is the crux of the batch): 'invited' → self-read only, nothing
--     else. 'active' → project + full roster read, via
--     is_creative_project_member() (unchanged, still requires status =
--     'active'). 'suspended' → no active-member privileges — falls out of
--     is_creative_project_member() automatically, the same mechanism as
--     'removed'. The owner can move a non-owner member into and out of
--     'suspended' via creative_project_members_owner_manage (its with-check
--     allows status in ('invited','active','suspended') — see below); there
--     is no separate RPC for it, and no owner-initiated path to 'removed'
--     (that remains leave_creative_project()-only, see Self-leave below).
--     'removed' → no active-member
--     privileges either, but the row and its history remain, self-readable
--     forever via creative_project_members_self_read (unchanged — it has no
--     status filter, so a removed or suspended member still sees their own
--     row; this is the deliberate minimal self-history policy). A table-level
--     check constraint enforces (status = 'removed') = (removed_at is not
--     null), so removed_at is set if and only if status is 'removed', and
--     the only path that can ever set status = 'removed' is
--     leave_creative_project() below (creative_project_members_owner_manage
--     is restricted to never write 'removed' — see its own comment) —
--     removed_at is therefore never settable by a direct client UPDATE at
--     all, since it isn't in the column-level UPDATE grant either.
--   - Self-read: a profile can always read their own row, in any
--     status/role, including a pending ('invited') row they haven't
--     accepted yet, and including a 'removed'/'suspended' row — this is how
--     history survives after leaving (see self-leave below).
--   - Full roster read for active members: any row with status='active' for
--     a project can see every row (any status/role) belonging to that same
--     project, via is_creative_project_member(project_id) — this is the
--     founder-approved "full roster visibility" posture for this batch,
--     a deliberate departure from organization_members' owner-only roster
--     read. The check is scoped per-row by that row's own project_id, so a
--     member of project A can never see project B's roster through this
--     policy, and a merely-invited (not yet active) member sees only their
--     own row via the self-read policy above, nothing else.
--   - Owner invite (insert): the project owner can invite a new member —
--     never themselves via this path, never with role='owner' (reserved for
--     the trigger-synced row), and status is forced to 'invited' regardless
--     of what the caller sends. A BEFORE INSERT trigger
--     (set_creative_project_member_invited_by) unconditionally overwrites
--     invited_by := auth.uid() for every insert on this table, including
--     this policy's own inserts, so invited_by can never be client-forged —
--     see its own comment near the trigger definition for why an overwrite
--     trigger was chosen over a with-check equality requirement.
--   - Owner manage (update): the project owner can update an existing
--     non-owner member's row (e.g. activate, or suspend) — never their own
--     row, never promoting anyone to role='owner', and — new in this
--     revision — never setting status='removed' (with-check restricts
--     status to 'invited'/'active'/'suspended' only). Hard removal by the
--     owner remains out of scope/deferred, unchanged from the prior batch's
--     decision; the only path to status='removed' is the member's own
--     leave_creative_project() call, which is what keeps removed_at
--     atomically consistent with status. Column-level UPDATE privileges
--     additionally restrict `authenticated` (which covers both the owner
--     and the admin-override policy, since FLOW admin is a claim on the same
--     Postgres role, not a separate one) to only role/status/joined_at/
--     updated_at — invited_by was dropped from this grant in this revision
--     (it's audit metadata fixed at invite time by the trigger above, never
--     something owner-manage should revise after the fact), and removed_at
--     was deliberately never added to it at all: only leave_creative_project()'s
--     SECURITY DEFINER context can write removed_at, since SECURITY DEFINER
--     bypasses column-level grants the same way it bypasses RLS. profile_id
--     and project_id can never be changed by an UPDATE regardless of what
--     the RLS using/with-check clauses allow, since a single using/with-check
--     pair cannot pin those columns to their pre-update values. Reassigning a
--     row's identity (which project or which profile it belongs to) requires
--     delete+insert, not update.
--   - Self-leave — no longer a client-facing RLS-gated DELETE (a prior draft
--     of this migration had one; it was removed because a hard DELETE
--     destroys history that the founder wants preserved). The only path to
--     leave a project is the leave_creative_project(project) SECURITY
--     DEFINER RPC: it targets only auth.uid() (no parameter accepts an
--     arbitrary profile), requires the caller to hold a non-owner, currently
--     'active' row for that project, and atomically sets status='removed',
--     removed_at=now() — every rejection path (not authenticated, not a
--     member, owner attempting to leave their own project, already
--     non-active) is a no-op returning {ok:false, reason:...}, never a
--     partial mutation. It is SECURITY DEFINER specifically because, after
--     this revision, there is no client-facing RLS/grant path at all for a
--     plain member to update their own row (no self-UPDATE policy exists or
--     is being added) — this RPC is the only mutation path.
--   - FLOW admin (AAL2): full access, same as every other admin-override
--     policy in this repo.
--
-- Trust boundary (explicit, load-bearing): creating a creative project or a
-- creative_project_members row NEVER reads from, writes to, or triggers any
-- change against public.verifications, verification_reviews,
-- profile_skills.verified, profile_credentials, achievements,
-- profile_achievements, or any other Passport/reputation table. No trigger
-- defined in this migration touches any of those tables. Membership on a
-- creative project carries zero reputation/verification weight in this
-- batch — that coupling, if it ever happens, is a deliberate future
-- decision requiring its own migration and its own founder sign-off, not an
-- accidental side effect of this one.
--
-- Explicitly out of scope for this migration (hard boundary, not
-- deferred-with-intent-to-follow-immediately): Creative Contributions,
-- Studio Sessions, contribution roles/decisions/disputes, assets,
-- provenance/evidence tables, `organization_id` on either table here,
-- opportunity/event integration, Passport UI, public-discovery, rights,
-- revenue, or wallet concepts. None of those are referenced by name or by
-- inference (e.g. no nullable "future-proofing" columns) anywhere below.
--
-- Known, intentionally-deferred gaps (state honestly, not silently
-- expanded in scope):
--   - No owner-initiated member-removal policy. Today the owner can invite
--     and update (e.g. activate) a member, but cannot remove one — only the
--     member themselves can leave (self-leave, active status only). Adding
--     owner-removal is straightforward future work (an update-to-a-removed-
--     status column, or a delete policy scoped to the owner) but wasn't
--     part of what was approved for this batch.
--   - No self-decline-an-invite policy. An invited (not yet active) member
--     cannot decline/delete their own pending invitation in this batch —
--     only an ACTIVE member can self-leave. Declining a pending invite is
--     deferred to a later batch.
--
-- Rollback: this is a brand-new pair of tables with no real data yet (zero
-- rows anywhere in this feature area at the time this migration is
-- written), so a full drop is safe to state plainly, not gated behind an
-- "only if no real rows exist" caveat the way organization_members' was:
--   drop trigger if exists creative_project_members_audit on public.creative_project_members;
--   drop trigger if exists creative_project_members_updated_at on public.creative_project_members;
--   drop trigger if exists creative_project_members_set_invited_by on public.creative_project_members;
--   drop trigger if exists creative_projects_sync_owner_membership on public.creative_projects;
--   drop trigger if exists creative_projects_audit on public.creative_projects;
--   drop trigger if exists creative_projects_updated_at on public.creative_projects;
--   drop function if exists public.leave_creative_project(uuid);
--   drop function if exists public.is_creative_project_member(uuid, text);
--   drop function if exists public.set_creative_project_member_invited_by();
--   drop function if exists public.sync_creative_project_owner_membership();
--   drop table if exists public.creative_project_members;
--   drop table if exists public.creative_projects;
-- (public.set_admin_updated_at() and public.log_admin_change() are shared,
-- pre-existing functions reused as-is — this migration does not create or
-- drop them.)

-- ── tables ─────────────────────────────────────────────────────────────────

create table public.creative_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index creative_projects_owner_id_idx on public.creative_projects (owner_id);

alter table public.creative_projects enable row level security;

create table public.creative_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, profile_id),
  constraint creative_project_members_removed_at_consistency
    check ((status = 'removed') = (removed_at is not null))
);

create index creative_project_members_profile_id_idx on public.creative_project_members (profile_id);
-- project_id is already the leftmost column of the unique(project_id, profile_id) index — no
-- separate index needed, same reasoning organization_members used for organization_id.

alter table public.creative_project_members enable row level security;

-- ── invited_by integrity ───────────────────────────────────────────────────

-- Unconditionally overwrites invited_by := auth.uid() on every insert into
-- this table, including the owner-sync trigger's own insert below (that
-- insert ends up with invited_by = the project creator's own id — i.e. the
-- owner "invited" themselves — which is correct and harmless). An overwrite
-- trigger is more robust than a with-check equality requirement: it can't be
-- bypassed and doesn't require client cooperation, so invited_by is
-- trustworthy audit metadata rather than client-suppliable data.
create or replace function public.set_creative_project_member_invited_by()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  new.invited_by = auth.uid();
  return new;
end;
$$;

revoke execute on function public.set_creative_project_member_invited_by() from public, anon, authenticated;

create trigger creative_project_members_set_invited_by
  before insert on public.creative_project_members
  for each row execute function public.set_creative_project_member_invited_by();

-- ── triggers (reusing existing shared admin-audit functions) ──────────────

create trigger creative_projects_updated_at
  before update on public.creative_projects
  for each row execute function public.set_admin_updated_at();

create trigger creative_projects_audit
  after insert or update or delete on public.creative_projects
  for each row execute function public.log_admin_change();

create trigger creative_project_members_updated_at
  before update on public.creative_project_members
  for each row execute function public.set_admin_updated_at();

create trigger creative_project_members_audit
  after insert or update or delete on public.creative_project_members
  for each row execute function public.log_admin_change();

-- ── keep creative_projects.owner_id and creative_project_members in sync ──

create or replace function public.sync_creative_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  insert into public.creative_project_members (project_id, profile_id, role, status, joined_at)
  values (new.id, new.owner_id, 'owner', 'active', new.created_at)
  on conflict (project_id, profile_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.sync_creative_project_owner_membership() from public, anon, authenticated;

create trigger creative_projects_sync_owner_membership
  after insert on public.creative_projects
  for each row execute function public.sync_creative_project_owner_membership();

-- ── helper function ────────────────────────────────────────────────────────

-- Recursion-safe membership check (see header comment, point 4): true if
-- the calling user has an active row for this project, optionally scoped to
-- one specific role. Like is_organization_member(), p_min_role is an exact
-- match, not a hierarchy check — 'owner'/'member' is a flat set here too.
create or replace function public.is_creative_project_member(p_project_id uuid, p_min_role text default null)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.creative_project_members m
    where m.project_id = p_project_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and (p_min_role is null or m.role = p_min_role)
  );
$$;

revoke execute on function public.is_creative_project_member(uuid, text) from public, anon;
grant execute on function public.is_creative_project_member(uuid, text) to authenticated;

-- ── RLS: creative_projects ─────────────────────────────────────────────────

create policy creative_projects_owner_manage
  on public.creative_projects for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy creative_projects_member_read
  on public.creative_projects for select
  using (public.is_creative_project_member(id));

create policy creative_projects_admin_all
  on public.creative_projects for all
  using (public.is_flow_admin(true))
  with check (public.is_flow_admin(true));

-- Note: no public-read policy (unlike organizations) — creative projects are
-- never public in this batch. The owner is automatically covered by
-- creative_projects_member_read too, since their own membership row is
-- synced to 'active' — that's expected and fine, creative_projects_owner_manage
-- still exists because it's the only policy granting insert/update/delete.

-- Column-level UPDATE privilege restriction: closes the owner_id-drift gap
-- described in the header comment above. authenticated (owner and
-- admin-override alike, since is_flow_admin(true) is a claim evaluated for
-- the same Postgres role, not a separate one) can only ever UPDATE
-- title/description/updated_at on this table — owner_id, id, and created_at
-- are excluded from the grant entirely, so no UPDATE statement naming
-- owner_id can succeed regardless of RLS policy content.
revoke update on public.creative_projects from authenticated;
grant update (title, description, updated_at) on public.creative_projects to authenticated;

-- ── RLS: creative_project_members ──────────────────────────────────────────

-- Self-read: always see your own row, including a pending invitation,
-- regardless of status.
create policy creative_project_members_self_read
  on public.creative_project_members for select
  using (profile_id = (select auth.uid()));

-- Full roster read for active members (any status/role) — the approved
-- posture change from organization_members' owner-only roster read. Scoped
-- per-project via the function's own project_id parameter/internal query —
-- a member of Project A can never see Project B's roster through this
-- policy.
create policy creative_project_members_active_roster_read
  on public.creative_project_members for select
  using (public.is_creative_project_member(project_id));

-- Owner invites a new (non-owner, always starts 'invited') member. Never
-- themselves, never role='owner' (reserved for the trigger-synced row).
create policy creative_project_members_owner_invite
  on public.creative_project_members for insert
  with check (
    exists (
      select 1 from public.creative_projects p
      where p.id = creative_project_members.project_id
        and p.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
    and role <> 'owner'
    and status = 'invited'
  );

-- Owner manages (e.g. activates) an existing non-owner member. Never their
-- own row, never promotes anyone to role='owner'.
create policy creative_project_members_owner_manage
  on public.creative_project_members for update
  using (
    exists (
      select 1 from public.creative_projects p
      where p.id = creative_project_members.project_id
        and p.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
  )
  with check (
    exists (
      select 1 from public.creative_projects p
      where p.id = creative_project_members.project_id
        and p.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
    and role <> 'owner'
    and status in ('invited', 'active', 'suspended')
  );

-- Column-level UPDATE privilege restriction: creative_project_members_owner_manage's
-- RLS with-check does not (and structurally cannot, in a single using/with-check pair)
-- pin profile_id/project_id to their pre-update values, so without this, an owner could
-- rewrite an existing row's profile_id to an arbitrary third-party profile (forging a
-- non-consensual "active" membership with no invite ever happening) or reassign
-- project_id to a different project they own. Column-level privileges are checked
-- independently of and prior to RLS, so this closes the gap regardless of policy
-- content: authenticated can only ever UPDATE the columns listed below. invited_by is
-- excluded (audit metadata fixed at invite time by the trigger above, never revisable
-- after the fact) and removed_at is excluded entirely (only leave_creative_project()'s
-- SECURITY DEFINER context can ever write it, since SECURITY DEFINER bypasses
-- column-level grants the same way it bypasses RLS).
revoke update on public.creative_project_members from authenticated;
grant update (role, status, joined_at, updated_at) on public.creative_project_members to authenticated;

-- Approved self-leave: the ONLY way a non-owner member can leave is the
-- leave_creative_project(project) SECURITY DEFINER RPC below — a prior draft
-- of this migration had a client-facing DELETE policy here; it was removed
-- because a hard DELETE destroys history the founder wants preserved. The
-- RPC targets only auth.uid() (no parameter accepts an arbitrary profile),
-- requires a currently 'active', non-owner row, and atomically sets
-- status='removed', removed_at=now() — every rejection path (not
-- authenticated, not a member, owner attempting to leave their own project,
-- already non-active) is a no-op returning {ok:false, reason:...}, never a
-- partial mutation. It never touches role, project_id, profile_id, or
-- invited_by. It is SECURITY DEFINER specifically because there is no
-- client-facing RLS/grant path at all for a plain member to update their own
-- row otherwise — no self-UPDATE policy exists or is being added. Mirrors
-- the remove_connection(p_connection_id uuid) jsonb-result idiom in
-- 20260818213134_harden_connections.sql:262-287 (row-locked select, a
-- {ok:false, reason:...} return per rejected precondition, no exception
-- raised for expected/anticipated rejection paths).
create or replace function public.leave_creative_project(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.creative_project_members;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_row
  from public.creative_project_members
  where project_id = p_project_id
    and profile_id = v_actor
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_row.role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'owner_cannot_leave');
  end if;
  if v_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  update public.creative_project_members
  set status = 'removed', removed_at = now()
  where id = v_row.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.leave_creative_project(uuid) from public, anon;
grant execute on function public.leave_creative_project(uuid) to authenticated;

create policy creative_project_members_admin_all
  on public.creative_project_members for all
  using (public.is_flow_admin(true))
  with check (public.is_flow_admin(true));
