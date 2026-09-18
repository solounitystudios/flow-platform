-- ============================================================
-- Activities V1 — PR A: foundation (schema + auth only)
-- ============================================================
--
-- Activities are a new first-class participation/discovery object, distinct
-- from `opportunities` (application/pay-gated work, including the existing
-- opportunity_type = 'volunteer' formal job) and `events` (time-boxed public
-- gatherings with their own ticketing). A workshop, volunteer shift,
-- training session, class, networking/mentoring session, or recreational/
-- community activity may optionally belong to an `organization_id` and/or
-- `event_id`, or stand entirely alone — an Activity is never subordinate to
-- either. Owned by the new `activities-participation` agent (see
-- .claude/FLOW_ORCHESTRATION.md and .claude/agents/activities-participation.md,
-- merged in PR #25).
--
-- Scope (PR A only): the object, its RLS, and a race-safe participation
-- lifecycle trigger. Explicitly deferred to PR B/C: the reward trigger
-- (flow_points/flow_ledger writes), the Passport evidence-submission UI and
-- its is_activity_participant() gating function, passport_summary changes,
-- notifications, paid registration, and any org-admin multi-manage RLS.
--
-- Reviewed read-only by schema-auditor before this file was written
-- (project mmwgedzsdhabygcrvqdm, no live activities/activity_participants
-- objects existed). Two findings were treated as hard blockers and are
-- fixed inline below (see sections B and E); the rest were explicit design
-- decisions made here rather than silently defaulted — noted at each site.

-- ── A. activities ────────────────────────────────────────────────────────
--
-- organization_id and event_id are both nullable and independent — neither
-- is required, and both may be set together (app-layer FLOW-SEC-002-style
-- integrity check for that combination lives in lib/authz.ts, matching how
-- opportunities.event_id linking integrity was already handled in PR #22 —
-- event_id has no access-control effect of its own, per FLOW-SEC-001's own
-- commentary, so it does not need a DB-level check the way organization_id
-- does below).
--
-- activity_type has no 'other' catch-all, matching opportunities.opportunity_type's
-- fixed-enum convention (events.category instead handles "unclassified" by
-- being nullable — opportunities' convention is the closer fit here since
-- activity_type, like opportunity_type, is required not null).
--
-- starts_at/ends_at are nullable (unlike events.starts_at not null) — an
-- Activity may be less time-bound than an Event (e.g. an ongoing "mentor
-- hour" with no fixed single occurrence yet in V1). This is a deliberate
-- product choice, not an oversight — see section C for how the lifecycle
-- trigger handles a null starts_at explicitly rather than letting NULL's
-- three-valued-logic silently no-op the check-in window.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  activity_type text not null check (activity_type in (
    'workshop','volunteer_shift','training','class','networking',
    'mentoring','creative_session','recreational','community'
  )),
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  city text not null default 'Buffalo',
  state text not null default 'NY',
  venue text,
  address text,
  lat numeric,
  lng numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index activities_city_status_idx on public.activities (city, state, status, starts_at);
create index activities_organization_id_idx on public.activities (organization_id);
create index activities_event_id_idx on public.activities (event_id);
create index activities_created_by_idx on public.activities (created_by);

alter table public.activities enable row level security;

-- ── B. activities RLS ───────────────────────────────────────────────────
--
-- Read: mirrors events_public_read/opportunities_public_read exactly — a
-- draft is visible only to its creator. Deliberately NOT extended to
-- "or is_organization_member(organization_id)" for org co-managers in this
-- PR: multi-admin activity management wasn't part of the approved PR A
-- scope, and FLOW-SEC-001's own posting-rights precedent (below) is
-- creator/owner-only, not multi-member — extending read to co-managers
-- without extending write the same way would be an inconsistent half-step.
-- Revisit in PR C if org-admin collaboration on drafts is actually needed.
create policy activities_public_read on public.activities
  for select using (status <> 'draft' or (select auth.uid()) = created_by);

-- Manage (insert/update/delete): creator-only, exactly like
-- events_creator_manage/opportunities_creator_manage — with one added
-- WITH CHECK condition mirroring FLOW-SEC-001
-- (20260820140929_organization_attribution_authorization.sql) verbatim:
-- schema-auditor's hard-blocker finding was that an organization_id column
-- feeding an authorization-relevant policy needs a DB-level ownership check,
-- not just app-layer validation, or any member could attribute a public
-- activity to a real organization they have no relationship to — the exact
-- bug FLOW-SEC-001 already fixed once for opportunities/events. Matching
-- that fix's explicit scope choice: organization posting rights belong to
-- the organization's owner only (organizations.owner_id = auth.uid()), not
-- any active organization_members row — member-level Activity posting
-- rights are deferred, not granted, same as FLOW-SEC-001 deferred them for
-- opportunities/events.
create policy activities_creator_manage on public.activities
  for all
  using ((select auth.uid()) = created_by)
  with check (
    (select auth.uid()) = created_by
    and (
      organization_id is null
      or exists (
        select 1 from public.organizations o
        where o.id = organization_id and o.owner_id = (select auth.uid())
      )
    )
  );

-- ── C. activity_participants ────────────────────────────────────────────
--
-- Status vocabulary and shape mirror creative_project_members' join pattern
-- (unique(parent_id, profile_id), no separate parent-id index needed since
-- it's the unique index's leftmost column, same reasoning documented in
-- 20260823041155_creative_projects_foundation.sql) combined with
-- event_attendance's check-in fields (checked_in_at/checked_in_by).
--
-- Two positive terminal-adjacent states, 'attended' and 'completed', are
-- kept distinct (rather than collapsed to event_attendance's single
-- 'attended') because the approved PR A action list explicitly separates
-- "host check-in / mark attended" from "host complete" as two host actions
-- — 'attended' means present/checked-in; 'completed' means the host has
-- additionally confirmed the participation's full outcome. 'attended' is
-- NOT terminal: its only forward transition is to 'completed' (see the
-- trigger below) — it cannot revert to 'no_show'/'cancelled'. 'completed',
-- 'no_show', and 'cancelled' are all terminal, matching
-- enforce_attendance_lifecycle's "already-terminal statuses can never be
-- changed" rule exactly.
create table public.activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','attended','completed','no_show','cancelled')),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  joined_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, profile_id)
);

create index activity_participants_profile_id_idx on public.activity_participants (profile_id);

alter table public.activity_participants enable row level security;

create policy activity_participants_participant_read on public.activity_participants
  for select using (
    (select auth.uid()) = profile_id
    or exists (select 1 from public.activities a where a.id = activity_id and a.created_by = (select auth.uid()))
  );

-- Self-manage (join + self-service cancel) only — mirrors
-- attendance_self_manage exactly (event_attendance's RLS grants the
-- participant no more than this either). Host actions (check-in/complete/
-- no-show) deliberately get NO RLS write path at all: per events.md's own
-- hard rule ("ticket/attendance state transitions must go through the
-- existing RPC pattern... or a new one built the same way — never a raw
-- client-side status update"), those go through the three SECURITY DEFINER
-- RPCs below (mirroring check_in_ticket/mark_no_show), which still pass
-- through the trigger below for transition validity — this is
-- defense-in-depth, not a replacement for it.
create policy activity_participants_self_manage on public.activity_participants
  for all
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

-- ── D. participation lifecycle trigger ──────────────────────────────────
--
-- Mirrors enforce_attendance_lifecycle() (20260819025059_harden_attendance_noop_update.sql)
-- with two deliberate departures, both schema-auditor findings:
--
-- 1. Capacity race-safety: the existing event_attendance capacity check is
--    a plain `select count(*)` with no row lock, which is not race-safe
--    under concurrent inserts (two transactions can each observe
--    count < capacity and both proceed). Rather than silently copying that
--    gap forward, this trigger takes `select ... for update` on the parent
--    activities row first, serializing concurrent inserts against the same
--    activity_id. (Backporting the same fix to event_attendance is a
--    separate decision, out of scope for this PR.)
-- 2. Null starts_at: rather than letting plpgsql's three-valued IF logic
--    silently no-op the check-in time window when starts_at is null (which
--    would be an accidental consequence of NULL semantics, not a designed
--    branch), the window check below is explicitly wrapped in
--    `if new.starts_at is not null then ... end if` — an undated activity's
--    host may check a participant in at any time, by design.
create or replace function public.enforce_activity_participation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_is_host boolean;
  v_taken int;
  v_checkin_opens timestamptz;
  v_checkin_closes timestamptz;
begin
  select * into v_activity from public.activities where id = new.activity_id for update;
  if v_activity is null then
    raise exception 'Activity not found.';
  end if;
  v_is_host := ((select auth.uid()) = v_activity.created_by);

  if tg_op = 'INSERT' then
    if v_activity.status <> 'published' then
      raise exception 'This activity is not open for participation.';
    end if;
    if v_activity.ends_at is not null and now() > v_activity.ends_at then
      raise exception 'This activity has already happened.';
    elsif v_activity.ends_at is null and v_activity.starts_at is not null and now() > v_activity.starts_at then
      raise exception 'This activity has already happened.';
    end if;
    if v_activity.capacity is not null then
      select count(*) into v_taken from public.activity_participants
      where activity_id = new.activity_id and status in ('registered', 'attended', 'completed');
      if v_taken >= v_activity.capacity then
        raise exception 'This activity is at capacity.';
      end if;
    end if;

    new.status := 'registered';
    new.joined_at := now();
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- tg_op = 'UPDATE' from here on. The host's writes reach this trigger via
  -- the SECURITY DEFINER RPCs below (section D2), which bypass RLS
  -- entirely for their internal UPDATE — so there is no RLS WITH CHECK at
  -- all constraining what those RPCs could in principle write. Identity/
  -- provenance columns are therefore unconditionally pinned to their OLD
  -- values here regardless of caller, the same overwrite-not-validate
  -- defense creative_project_members uses for invited_by, rather than
  -- relying on each RPC to never misuse its own bypass.
  new.activity_id := old.activity_id;
  new.profile_id := old.profile_id;
  new.joined_at := old.joined_at;

  -- True no-op: return OLD unchanged (not NEW) so no client-supplied field
  -- can leak through on an idempotent repeat call — mirrors
  -- enforce_attendance_lifecycle's harden_attendance_noop_update fix
  -- exactly (20260819025059_harden_attendance_noop_update.sql).
  if old.status = new.status then
    return old;
  end if;

  -- Reactivation: a previously cancelled participant may register again,
  -- subject to the same eligibility checks as a brand-new registration —
  -- must be checked before the terminal-status rule below, or 'cancelled'
  -- would be permanently final with no way back. Mirrors
  -- enforce_attendance_lifecycle's identical 'cancelled' -> 'registered'
  -- branch.
  if old.status = 'cancelled' and new.status = 'registered' then
    if v_activity.status <> 'published' then
      raise exception 'This activity is not open for participation.';
    end if;
    if v_activity.ends_at is not null and now() > v_activity.ends_at then
      raise exception 'This activity has already happened.';
    elsif v_activity.ends_at is null and v_activity.starts_at is not null and now() > v_activity.starts_at then
      raise exception 'This activity has already happened.';
    end if;
    if v_activity.capacity is not null then
      select count(*) into v_taken from public.activity_participants
      where activity_id = new.activity_id and status in ('registered', 'attended', 'completed');
      if v_taken >= v_activity.capacity then
        raise exception 'This activity is at capacity.';
      end if;
    end if;
    new.joined_at := now();
    new.checked_in_at := null;
    new.checked_in_by := null;
    new.cancelled_at := null;
    return new;
  end if;

  if old.status in ('completed', 'no_show', 'cancelled') then
    raise exception 'This participation is already % and cannot be changed.', old.status;
  end if;

  if old.status = 'registered' and new.status = 'cancelled' then
    if (select auth.uid()) <> old.profile_id then
      raise exception 'Only the participant can cancel their own registration.';
    end if;
    new.cancelled_at := now();
    return new;
  end if;

  if old.status = 'registered' and new.status = 'attended' then
    if not v_is_host then
      raise exception 'Only the activity host can check in a participant.';
    end if;
    if v_activity.starts_at is not null then
      v_checkin_opens := v_activity.starts_at - interval '60 minutes';
      v_checkin_closes := coalesce(v_activity.ends_at, v_activity.starts_at + interval '4 hours') + interval '120 minutes';
      if now() < v_checkin_opens or now() > v_checkin_closes then
        raise exception 'Check-in is only open from 1 hour before the activity until 2 hours after it ends.';
      end if;
    end if;
    new.checked_in_at := now();
    new.checked_in_by := (select auth.uid());
    return new;
  end if;

  if old.status = 'registered' and new.status = 'no_show' then
    if not v_is_host then
      raise exception 'Only the activity host can mark a no-show.';
    end if;
    return new;
  end if;

  if old.status = 'attended' and new.status = 'completed' then
    if not v_is_host then
      raise exception 'Only the activity host can mark a participation completed.';
    end if;
    return new;
  end if;

  raise exception 'Cannot move a participation from % to %.', old.status, new.status;
end;
$$;

revoke execute on function public.enforce_activity_participation_lifecycle() from public, anon, authenticated;

drop trigger if exists trg_enforce_activity_participation_lifecycle on public.activity_participants;
create trigger trg_enforce_activity_participation_lifecycle
  before insert or update on public.activity_participants
  for each row execute function public.enforce_activity_participation_lifecycle();

-- ── D2. host-only participation RPCs ─────────────────────────────────────
--
-- Mirror check_in_ticket/mark_no_show (20260818153046_phase3_events_tickets.sql)
-- exactly: SECURITY DEFINER, verify the caller is the activity's host
-- (`created_by`) before touching anything, return a structured
-- jsonb {ok, reason} result rather than relying on a raised SQL exception,
-- and let the UPDATE still pass through
-- enforce_activity_participation_lifecycle above for transition validity —
-- this is defense-in-depth, not the only gate. No `p_checkin_code`
-- equivalent exists yet (Activities have no QR-pass concept in this PR);
-- host check-in is by profile_id only for now.
create or replace function public.check_in_activity_participant(p_activity_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
  v_row record;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if v_activity is null or v_activity.created_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select * into v_row from public.activity_participants where activity_id = p_activity_id and profile_id = p_profile_id;
  if v_row is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.activity_participants set status = 'attended'
  where activity_id = p_activity_id and profile_id = p_profile_id;

  return jsonb_build_object('ok', true, 'checked_in_at', now());
end;
$$;

revoke execute on function public.check_in_activity_participant(uuid, uuid) from public, anon;

create or replace function public.mark_activity_no_show(p_activity_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if v_activity is null or v_activity.created_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  update public.activity_participants set status = 'no_show'
  where activity_id = p_activity_id and profile_id = p_profile_id and status = 'registered';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_not_registered');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.mark_activity_no_show(uuid, uuid) from public, anon;

create or replace function public.complete_activity_participant(p_activity_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity record;
begin
  select * into v_activity from public.activities where id = p_activity_id;
  if v_activity is null or v_activity.created_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  update public.activity_participants set status = 'completed'
  where activity_id = p_activity_id and profile_id = p_profile_id and status = 'attended';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found_or_not_attended');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.complete_activity_participant(uuid, uuid) from public, anon;

-- Reuses the existing shared public.set_admin_updated_at() function
-- (20260819035422_admin_employer_outreach_mvp.sql), the same one
-- creative_projects/creative_project_members/organization_members already
-- use for this exact purpose — no new generic trigger function needed.
create trigger activities_updated_at
  before update on public.activities
  for each row execute function public.set_admin_updated_at();

create trigger activity_participants_updated_at
  before update on public.activity_participants
  for each row execute function public.set_admin_updated_at();

-- ── E. flow_ledger.activity_id ───────────────────────────────────────────
--
-- Additive, nullable, unreferenced by any trigger yet (the reward trigger
-- is PR B's scope). schema-auditor confirmed flow_ledger has never had any
-- client insert/update/delete RLS policy — ledger_self_read is select-only
-- — so this column creates zero client-writable points path on its own.
alter table public.flow_ledger add column if not exists activity_id uuid references public.activities(id) on delete set null;

-- ── F. verifications_reference_table_check widened, kept fully inert ────
--
-- schema-auditor's other hard-blocker finding: verifications_self_insert's
-- WITH CHECK gates 'creative_project' and 'application' each with their own
-- is_*_member()/is_*_participant() predicate — a reference_table value
-- named in the CHECK constraint but not yet named in that WITH CHECK would
-- collapse to an open, ungated self-insert (any authenticated member could
-- self-insert a pending verifications row with an arbitrary reference_id).
-- Since PR A intentionally does not build the evidence-submission UI or an
-- is_activity_participant() gating function yet, this migration widens the
-- CHECK constraint (so the value exists and PR B doesn't need a second
-- CHECK migration) but ALSO adds an unconditional exclusion for
-- 'activity_participation' to verifications_self_insert, so no row with
-- that reference_table can be inserted by anyone until PR B replaces the
-- exclusion with a real is_activity_participant(reference_id) gate — the
-- same shape 'application' used, just inverted to "closed" instead of
-- "open" until that function exists.
alter table public.verifications drop constraint if exists verifications_reference_table_check;
alter table public.verifications add constraint verifications_reference_table_check
  check (reference_table is null or reference_table in ('profile_skill', 'creative_project', 'application', 'activity_participation'));

drop policy if exists verifications_self_insert on public.verifications;
create policy verifications_self_insert on public.verifications for insert
  with check (
    (select auth.uid()) = profile_id
    and status = 'pending'
    and (
      reference_table is distinct from 'creative_project'
      or public.is_creative_project_member(reference_id)
    )
    and (
      reference_table is distinct from 'application'
      or public.is_application_participant(reference_id)
    )
    and reference_table is distinct from 'activity_participation'
  );
