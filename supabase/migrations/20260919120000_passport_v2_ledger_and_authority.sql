-- ============================================================
-- Passport V2 core — part 1: event ledger, subject ownership, authority
-- ============================================================
--
-- Canonical Passport Core foundations (see docs/passport/). Additive only:
-- three new tables, a handful of new functions, no change to any existing
-- table, policy or function. Nothing here reads or writes legacy Passport
-- data (verifications, profile_credentials, ...) — those keep their own
-- pipeline and are adapted read-side (see docs/passport/PASSPORT_V2_ARCHITECTURE.md).
--
-- Design rules this file follows (established by earlier migrations):
--   * RLS + SECURITY DEFINER RPCs with a fixed search_path are the only write
--     path. No INSERT/UPDATE/DELETE policy exists for any client role, and
--     table privileges are explicitly revoked as defence in depth — this
--     Supabase image grants ALL on new public tables/functions to anon and
--     authenticated by default, so every object below revokes what it must.
--   * ROLE != AUTHORITY. passport_has_authority() never reads
--     organization_members.role. Authority is an explicit, scoped, expiring,
--     revocable assignment — with one derivation: record ownership
--     (organizations.owner_id etc.) proves the `owner` authority.
--   * The event ledger is append-only and is written inside the same
--     transaction as the change it describes.
--
-- Rollback (nothing else depends on these objects until later migrations):
--   drop function if exists public.passport_revoke_authority(uuid, text);
--   drop function if exists public.passport_assign_authority(uuid, text, uuid, text, text[], text[], timestamptz);
--   drop function if exists public.passport_has_authority(text, uuid, text, text, text);
--   drop function if exists public.passport_subject_owner_ok(text, uuid);
--   drop table if exists public.passport_authority_assignments;
--   drop function if exists public._passport_emit_event(text, text, text, text, uuid, jsonb, jsonb, text, text);
--   drop table if exists public.passport_events;
--   drop function if exists public.passport_event_append_only();
--   drop function if exists public.passport_subject_type_ok(text);

-- ── A. vocabulary helpers ────────────────────────────────────────────────

-- Persisted subject types. `business` is deliberately absent: Flow's
-- organizations row IS the business entity, so refs are canonicalised to
-- 'organization' before they reach the database (one entity, one Passport).
create or replace function public.passport_subject_type_ok(p_type text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select p_type in ('person', 'organization', 'program', 'team', 'vehicle', 'asset', 'venue', 'event', 'project', 'agency', 'activity');
$$;

create or replace function public.passport_canonical_subject_type(p_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case when p_type = 'business' then 'organization' else p_type end;
$$;

grant execute on function public.passport_subject_type_ok(text) to anon, authenticated, service_role;
grant execute on function public.passport_canonical_subject_type(text) to anon, authenticated, service_role;

-- ── B. record ownership ──────────────────────────────────────────────────
-- "Does the caller own the RECORD for this subject?" Ownership is a fact
-- about a stored row (organizations.owner_id, events.created_by, ...), not a
-- role. Subject types with no Flow table yet (vehicle, asset, venue, team,
-- program, agency) have no resolver and therefore DENY — no path exists to
-- act for them until a real ownership source does. This function and
-- passport_subject_is_public() are the only two places Passport Core reads
-- Flow's own tables to resolve a subject, which is the seam to cut when
-- Passport is extracted into its own service.
create or replace function public.passport_subject_owner_ok(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select coalesce(
    auth.uid() is not null and case p_type
      when 'person' then p_id = auth.uid()
      when 'organization' then exists (
        select 1 from public.organizations o where o.id = p_id and o.owner_id = auth.uid()
      )
      when 'event' then exists (
        select 1 from public.events e
        left join public.organizations o on o.id = e.organization_id
        where e.id = p_id and (e.created_by = auth.uid() or o.owner_id = auth.uid())
      )
      when 'activity' then exists (
        select 1 from public.activities a
        left join public.organizations o on o.id = a.organization_id
        where a.id = p_id and (a.created_by = auth.uid() or o.owner_id = auth.uid())
      )
      when 'project' then exists (
        select 1 from public.creative_projects c where c.id = p_id and c.owner_id = auth.uid()
      )
      else false
    end,
    false
  );
$$;

-- anon needs EXECUTE too: the public-read claims policy references this
-- function, and Postgres checks EXECUTE privilege at parse time for every
-- function a policy mentions, whether or not an OR short-circuits around it.
-- For anon auth.uid() is null, so this deterministically returns false — it
-- grants no capability (same reasoning as is_flow_admin's anon grant).
revoke all on function public.passport_subject_owner_ok(text, uuid) from public;
grant execute on function public.passport_subject_owner_ok(text, uuid) to anon, authenticated, service_role;

-- Does a subject allow its public claims to be seen by strangers? For a
-- person that is the existing profiles.public_passport switch (and blocking
-- is honoured); for every other subject the claim's own `visibility` flag is
-- the control. Reuses the same gating passport_summary applies.
create or replace function public.passport_subject_is_public(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select case p_type
    when 'person' then exists (
      select 1 from public.profiles p
      where p.id = p_id and p.public_passport = true
        and not public.is_blocked_between(p.id, auth.uid())
    )
    else true
  end;
$$;

revoke all on function public.passport_subject_is_public(text, uuid) from public;
grant execute on function public.passport_subject_is_public(text, uuid) to anon, authenticated, service_role;

-- ── C. event ledger ──────────────────────────────────────────────────────
-- Append-only history of consequential Passport actions. NOT the system of
-- record — the tables are; events describe what happened to them. Existing
-- audit mechanisms were evaluated and not reused: admin_audit_log is an
-- admin-only whole-row diff trigger log; flow_ledger is points/earnings.

create table public.passport_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  schema_version text not null default '1.0',
  event_type text not null check (event_type in (
    'claim.created',
    'claim.submitted',
    'claim.under_review',
    'claim.verified',
    'claim.rejected',
    'claim.expired',
    'claim.revoked',
    'claim.superseded',
    'claim.stale',
    'claim.disconnected',
    'evidence.created',
    'evidence.attached',
    'evidence.removed',
    'verification.requested',
    'verification.completed',
    'consent.requested',
    'consent.granted',
    'consent.declined',
    'consent.revoked',
    'consent.expired',
    'consent.withdrawn',
    'authority.assigned',
    'authority.revoked',
    'relationship.created',
    'relationship.accepted',
    'relationship.declined',
    'relationship.ended',
    'credential.shared',
    'dispute.opened',
    'dispute.under_review',
    'dispute.resolved',
    'dispute.rejected',
    'dispute.withdrawn',
    'capture.requested',
    'capture.accepted',
    'capture.started',
    'capture.completed',
    'capture.failed',
    'capture.cancelled',
    'capture.expired',
    'integration.connected',
    'integration.degraded',
    'integration.disconnected',
    'integration.sync_failed'
  )),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('person', 'service', 'system')),
  actor_id text not null check (char_length(actor_id) between 1 and 128),
  subject_type text not null check (public.passport_subject_type_ok(subject_type)),
  subject_id uuid not null,
  refs jsonb not null default '{}'::jsonb check (jsonb_typeof(refs) = 'object'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 8192),
  correlation_id text check (correlation_id is null or char_length(correlation_id) <= 128),
  source_system text not null default 'flow_platform' check (char_length(source_system) between 1 and 64)
);

create unique index passport_events_seq_idx on public.passport_events (seq);
create index passport_events_subject_idx on public.passport_events (subject_type, subject_id, seq desc);
create index passport_events_type_idx on public.passport_events (event_type, seq desc);
create index passport_events_correlation_idx on public.passport_events (correlation_id) where correlation_id is not null;

alter table public.passport_events enable row level security;

-- Append-only, enforced twice: privileges are revoked below, and this trigger
-- stops even a privileged role (or a future careless RPC) from rewriting
-- history. TRUNCATE is blocked the same way.
create or replace function public.passport_event_append_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception 'passport_events is append-only (% is not permitted)', tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger passport_events_no_update_delete
  before update or delete on public.passport_events
  for each row execute function public.passport_event_append_only();

create trigger passport_events_no_truncate
  before truncate on public.passport_events
  for each statement execute function public.passport_event_append_only();

revoke all on table public.passport_events from public, anon, authenticated;
grant select on table public.passport_events to authenticated;
grant select, insert on table public.passport_events to service_role;

-- Who can read history: the owner of the subject the events are about, the
-- person who performed the action, and an AAL2 admin (audit data).
create policy passport_events_read on public.passport_events for select to authenticated
  using (
    public.passport_subject_owner_ok(subject_type, subject_id)
    or (actor_type = 'person' and actor_id = (select auth.uid())::text)
    or public.is_flow_admin(true)
  );

-- Internal writer. Not callable by any client role — only from other
-- SECURITY DEFINER functions in this schema, in the same transaction as the
-- state change being recorded.
create or replace function public._passport_emit_event(
  p_type text,
  p_actor_type text,
  p_actor_id text,
  p_subject_type text,
  p_subject_id uuid,
  p_refs jsonb default '{}'::jsonb,
  p_payload jsonb default '{}'::jsonb,
  p_correlation_id text default null,
  p_source_system text default 'flow_platform'
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_id uuid;
begin
  insert into public.passport_events (event_type, actor_type, actor_id, subject_type, subject_id, refs, payload, correlation_id, source_system)
  values (p_type, p_actor_type, p_actor_id, public.passport_canonical_subject_type(p_subject_type), p_subject_id,
          coalesce(p_refs, '{}'::jsonb), coalesce(p_payload, '{}'::jsonb), p_correlation_id, p_source_system)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public._passport_emit_event(text, text, text, text, uuid, jsonb, jsonb, text, text) from public, anon, authenticated;

-- ── D. authority assignments ─────────────────────────────────────────────
-- AUTHORITY = permission to make a consequential assertion or decision on
-- behalf of another entity. It is not a role. An org's admin/recruiter/
-- manager membership says what someone does in the product; it never implies
-- any authority below.
--
-- Assignable in this wave: only types something actually consumes —
--   credential_issuer / evidence_reviewer  (verification decisions)
--   data_requester                         (consent + capture requests)
-- The remaining vocabulary (hiring_approver, program_administrator,
-- event_operator, guardian, delegated_operator, agency_program_authority)
-- exists in the contracts but has no consumer and no assignment path yet;
-- `owner` is never assigned, only derived from record ownership, and
-- `guardian` awaits the Youth/Guardian consent model.

create table public.passport_authority_assignments (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check (public.passport_subject_type_ok(entity_type)),
  entity_id uuid not null,
  authority_type text not null check (authority_type in (
    'owner', 'credential_issuer', 'evidence_reviewer', 'hiring_approver', 'data_requester',
    'program_administrator', 'event_operator', 'guardian', 'delegated_operator', 'agency_program_authority'
  )),
  scope jsonb not null default '{"purposes":[],"claim_type_prefixes":[]}'::jsonb,
  source text not null default 'assigned' check (source in ('record_ownership', 'assigned', 'delegated', 'system')),
  delegator_id uuid references public.profiles(id) on delete set null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint passport_authority_scope_shape check (
    jsonb_typeof(scope -> 'purposes') = 'array' and jsonb_typeof(scope -> 'claim_type_prefixes') = 'array'
  ),
  -- Every authority except record-ownership-derived `owner` must be narrowed
  -- to at least one purpose or claim-type prefix. An unscoped authority would
  -- be a role by another name.
  constraint passport_authority_scope_required check (
    authority_type = 'owner'
    or jsonb_array_length(scope -> 'purposes') + jsonb_array_length(scope -> 'claim_type_prefixes') > 0
  ),
  constraint passport_authority_revoked_consistency check ((status = 'revoked') = (revoked_at is not null)),
  constraint passport_authority_window check (expires_at is null or expires_at > starts_at)
);

create unique index passport_authority_one_active_idx
  on public.passport_authority_assignments (principal_id, entity_type, entity_id, authority_type)
  where status = 'active';
create index passport_authority_entity_idx on public.passport_authority_assignments (entity_type, entity_id);

alter table public.passport_authority_assignments enable row level security;

revoke all on table public.passport_authority_assignments from public, anon, authenticated;
grant select on table public.passport_authority_assignments to authenticated;
grant select on table public.passport_authority_assignments to service_role;

-- The principal can see what they hold; the entity's owner can see who acts
-- for it; an AAL2 admin can audit. Nobody can write except through the RPCs.
create policy passport_authority_read on public.passport_authority_assignments for select to authenticated
  using (
    principal_id = (select auth.uid())
    or public.passport_subject_owner_ok(entity_type, entity_id)
    or public.is_flow_admin(true)
  );

-- The single authorization question every consequential Passport RPC asks.
-- Reads assignments and record ownership ONLY — never a membership role.
create or replace function public.passport_has_authority(
  p_entity_type text,
  p_entity_id uuid,
  p_authority text,
  p_purpose text default null,
  p_claim_type text default null
)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select auth.uid() is not null and (
    (p_authority = 'owner' and public.passport_subject_owner_ok(p_entity_type, p_entity_id))
    or exists (
      select 1 from public.passport_authority_assignments a
      where a.principal_id = auth.uid()
        and a.entity_type = p_entity_type
        and a.entity_id = p_entity_id
        and a.authority_type = p_authority
        and a.status = 'active'
        and a.starts_at <= now()
        and (a.expires_at is null or a.expires_at > now())
        and (p_purpose is null or jsonb_array_length(a.scope -> 'purposes') = 0 or (a.scope -> 'purposes') ? p_purpose)
        and (
          p_claim_type is null
          or jsonb_array_length(a.scope -> 'claim_type_prefixes') = 0
          or exists (
            select 1 from jsonb_array_elements_text(a.scope -> 'claim_type_prefixes') as pfx(prefix)
            where p_claim_type = pfx.prefix or left(p_claim_type, length(pfx.prefix) + 1) = pfx.prefix || '.'
          )
        )
    )
  );
$$;

revoke all on function public.passport_has_authority(text, uuid, text, text, text) from public, anon;
grant execute on function public.passport_has_authority(text, uuid, text, text, text) to authenticated, service_role;

-- Assign a scoped, expiring authority on an entity. Only the entity's record
-- owner may do this, and only for the types that have a consumer today.
create or replace function public.passport_assign_authority(
  p_principal uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_authority text,
  p_purposes text[] default '{}',
  p_claim_type_prefixes text[] default '{}',
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_entity_type text := public.passport_canonical_subject_type(p_entity_type);
  v_purposes text[] := coalesce(p_purposes, '{}');
  v_prefixes text[] := coalesce(p_claim_type_prefixes, '{}');
  v_id uuid;
  v_prefix text;
  v_purpose text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.passport_subject_type_ok(v_entity_type) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_subject_type');
  end if;
  if p_authority not in ('credential_issuer', 'evidence_reviewer', 'data_requester') then
    return jsonb_build_object('ok', false, 'reason', 'authority_not_assignable');
  end if;
  -- These three only make sense for an organization acting as verifier/requester.
  if v_entity_type <> 'organization' then
    return jsonb_build_object('ok', false, 'reason', 'authority_entity_mismatch');
  end if;
  if not public.passport_subject_owner_ok(v_entity_type, p_entity_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_entity_owner');
  end if;
  if not exists (select 1 from public.profiles where id = p_principal) then
    return jsonb_build_object('ok', false, 'reason', 'principal_not_found');
  end if;

  if coalesce(array_length(v_purposes, 1), 0) + coalesce(array_length(v_prefixes, 1), 0) = 0
     or coalesce(array_length(v_purposes, 1), 0) > 20 or coalesce(array_length(v_prefixes, 1), 0) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_scope');
  end if;
  foreach v_purpose in array v_purposes loop
    if v_purpose not in ('hiring_review', 'credential_check', 'event_entry', 'program_enrollment', 'capture_request', 'mentorship') then
      return jsonb_build_object('ok', false, 'reason', 'invalid_scope');
    end if;
  end loop;
  foreach v_prefix in array v_prefixes loop
    if v_prefix !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$' or char_length(v_prefix) > 80 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_scope');
    end if;
  end loop;

  -- Authority always expires; renewal is a new, audited assignment.
  if p_expires_at is null then
    return jsonb_build_object('ok', false, 'reason', 'expiry_required');
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '730 days' then
    return jsonb_build_object('ok', false, 'reason', 'expiry_invalid');
  end if;

  -- Release the one-active-per-triple slot if a prior assignment has lapsed.
  update public.passport_authority_assignments
     set status = 'expired'
   where principal_id = p_principal and entity_type = v_entity_type and entity_id = p_entity_id
     and authority_type = p_authority and status = 'active' and expires_at is not null and expires_at <= now();

  begin
    insert into public.passport_authority_assignments
      (principal_id, entity_type, entity_id, authority_type, scope, source, delegator_id, expires_at, created_by)
    values
      (p_principal, v_entity_type, p_entity_id, p_authority,
       jsonb_build_object('purposes', to_jsonb(v_purposes), 'claim_type_prefixes', to_jsonb(v_prefixes)),
       'assigned', auth.uid(), p_expires_at, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_active');
  end;

  perform public._passport_emit_event(
    'authority.assigned', 'person', auth.uid()::text, v_entity_type, p_entity_id,
    jsonb_build_object('authority_id', v_id),
    jsonb_build_object('authority_type', p_authority, 'principal_id', p_principal, 'expires_at', p_expires_at)
  );

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.passport_assign_authority(uuid, text, uuid, text, text[], text[], timestamptz) from public, anon;
grant execute on function public.passport_assign_authority(uuid, text, uuid, text, text[], text[], timestamptz) to authenticated;

-- The entity's owner may revoke anyone's authority; a principal may always
-- renounce their own. History is kept — revocation flips status, never deletes.
create or replace function public.passport_revoke_authority(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_row public.passport_authority_assignments%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_row from public.passport_authority_assignments where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_row.principal_id = auth.uid() or public.passport_subject_owner_ok(v_row.entity_type, v_row.entity_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  if p_reason is not null and char_length(p_reason) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;

  update public.passport_authority_assignments
     set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where id = p_id;

  perform public._passport_emit_event(
    'authority.revoked', 'person', auth.uid()::text, v_row.entity_type, v_row.entity_id,
    jsonb_build_object('authority_id', p_id),
    jsonb_build_object('authority_type', v_row.authority_type, 'principal_id', v_row.principal_id, 'self', v_row.principal_id = auth.uid())
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_revoke_authority(uuid, text) from public, anon;
grant execute on function public.passport_revoke_authority(uuid, text) to authenticated;
