-- Employer multi-admin foundation — Part A: organization_members table.
--
-- Today every organization has exactly one admin: `organizations.owner_id`,
-- enforced end-to-end by the single `orgs_owner_manage` policy
-- (`auth.uid() = owner_id`). This introduces a real membership table so an
-- organization can eventually have more than one person acting on its
-- behalf, without touching `owner_id` or any existing policy/RPC that reads
-- it — `owner_id` stays the source of truth for "who owns this org"; this
-- table is additive on top of it.
--
-- What this migration adds, and nothing else:
--
--   1. public.organization_members — one row per (organization, profile)
--      relationship, with a role (owner/admin/recruiter/manager) and a
--      lifecycle status (invited/active/suspended/removed). `role = 'owner'`
--      is reserved for the row that mirrors `organizations.owner_id` — see
--      point 3 — it is never assignable via the invite/manage policies below.
--
--   2. RLS: members can read their own row; the org owner can read every
--      member row for their org and can invite/manage non-owner members
--      (insert/update), but cannot insert or update their own row through
--      these policies (self-management of the owner's own membership row
--      isn't a real use case yet, and blocking it removes a self-promotion
--      vector) and cannot grant `role = 'owner'` to anyone else. An active
--      AAL2 FLOW admin can do anything, mirroring every other admin-override
--      policy in this repo. There is deliberately no self-insert or
--      self-update policy — an invited member accepting/managing their own
--      row is intentionally out of scope for this migration and will need
--      its own narrow RPC in a later batch, not a broad RLS policy.
--
--   3. sync_organization_owner_membership() — an AFTER INSERT trigger on
--      organizations that inserts the matching owner row into
--      organization_members automatically, so `owner_id` and
--      organization_members never drift apart for new orgs going forward.
--      A one-time backfill (below) does the same for every existing org.
--
--   4. is_organization_member(org, min_role) / has_organization_role(org,
--      role) — SECURITY DEFINER helper functions, shaped exactly like
--      public.is_flow_admin(), for other policies/RPCs (including Part B of
--      this same batch) to gate on membership without duplicating the
--      EXISTS subquery everywhere. `has_organization_role` does an *exact*
--      match, not a hierarchy check — 'owner','admin','recruiter','manager'
--      is a flat set of roles today, not an ordered ladder, so "recruiter"
--      is not automatically satisfied by "owner". Callers that want "at
--      least owner-or-admin" should pass that intent explicitly once such a
--      hierarchy is actually needed; nothing in this batch requires it yet.
--
-- Explicitly out of scope for this migration: any UI, any invite-acceptance
-- RPC, any change to `organizations.owner_id` itself, any read access this
-- membership unlocks on other tables (that's Part B, a separate
-- later-timestamped file since it depends on is_organization_member()
-- existing first).
--
-- Rollback: this migration is purely additive — nothing existing is
-- altered, dropped, or narrowed. If it ever needs to be rolled back before
-- Part B is applied and before any real invitations exist:
--   drop trigger if exists organization_members_audit on public.organization_members;
--   drop trigger if exists organization_members_updated_at on public.organization_members;
--   drop trigger if exists organizations_sync_owner_membership on public.organizations;
--   drop function if exists public.sync_organization_owner_membership();
--   drop function if exists public.has_organization_role(uuid, text);
--   drop function if exists public.is_organization_member(uuid, text);
--   drop table if exists public.organization_members;
-- IMPORTANT: once real invitations/backfilled rows exist, dropping this
-- table discards real membership data (including the owner backfill) —
-- that requires explicit founder authorization at rollback time, same as
-- any other drop against a table that could hold real rows, even though
-- the forward migration itself is additive and safe to apply.

-- ── table ──────────────────────────────────────────────────────────────────

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin', 'recruiter', 'manager')),
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create index organization_members_profile_id_idx on public.organization_members (profile_id);

alter table public.organization_members enable row level security;

-- ── RLS ────────────────────────────────────────────────────────────────────

create policy organization_members_self_read
  on public.organization_members for select
  using ((select auth.uid()) = profile_id);

create policy organization_members_owner_read
  on public.organization_members for select
  using (
    exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_id = (select auth.uid())
    )
  );

create policy organization_members_admin_all
  on public.organization_members for all
  using (public.is_flow_admin(true))
  with check (public.is_flow_admin(true));

-- Owner can invite non-owner members: never themselves via this path, and
-- never with role = 'owner' (that role is reserved for the
-- sync-from-organizations.owner_id row created by the trigger/backfill
-- below). status is forced to 'invited' regardless of what the caller sends.
create policy organization_members_owner_invite
  on public.organization_members for insert
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
    and role <> 'owner'
    and status = 'invited'
  );

-- Owner can manage (e.g. change role/status of) existing non-owner members:
-- never their own row, and never promote anyone to role = 'owner'.
create policy organization_members_owner_manage
  on public.organization_members for update
  using (
    exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
  )
  with check (
    exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_id = (select auth.uid())
    )
    and profile_id <> (select auth.uid())
    and role <> 'owner'
  );

-- ── triggers (reusing existing shared admin-audit functions) ──────────────

create trigger organization_members_updated_at
  before update on public.organization_members
  for each row execute function public.set_admin_updated_at();

create trigger organization_members_audit
  after insert or update or delete on public.organization_members
  for each row execute function public.log_admin_change();

-- ── keep organizations.owner_id and organization_members in sync ─────────

create or replace function public.sync_organization_owner_membership()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  insert into public.organization_members (organization_id, profile_id, role, status, joined_at)
  values (new.id, new.owner_id, 'owner', 'active', new.created_at)
  on conflict (organization_id, profile_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.sync_organization_owner_membership() from public, anon, authenticated;

create trigger organizations_sync_owner_membership
  after insert on public.organizations
  for each row execute function public.sync_organization_owner_membership();

-- One-time backfill for organizations that already existed before this
-- migration — mirrors exactly what the trigger above will do for new orgs.
insert into public.organization_members (organization_id, profile_id, role, status, joined_at)
select id, owner_id, 'owner', 'active', created_at
from public.organizations
on conflict (organization_id, profile_id) do nothing;

-- ── helper functions ───────────────────────────────────────────────────────

-- Exact-match membership check: true if the calling user has an
-- active/joined row for this org, optionally scoped to one specific role.
-- p_min_role is a misleading-if-read-as-a-hierarchy name kept for parity
-- with the design doc, but the check below is an exact match, not >= — the
-- four roles are a flat set today, not an ordered ladder.
create or replace function public.is_organization_member(p_organization_id uuid, p_min_role text default null)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and (p_min_role is null or m.role = p_min_role)
  );
$$;

revoke execute on function public.is_organization_member(uuid, text) from public, anon;
grant execute on function public.is_organization_member(uuid, text) to authenticated;

-- Thin wrapper: exact role match, not a hierarchy check (see comment above).
create or replace function public.has_organization_role(p_organization_id uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select public.is_organization_member(p_organization_id, p_role);
$$;

revoke execute on function public.has_organization_role(uuid, text) from public, anon;
grant execute on function public.has_organization_role(uuid, text) to authenticated;
