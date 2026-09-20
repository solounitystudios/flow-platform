-- ============================================================
-- Passport V2 — part 5: canonical relationships
-- ============================================================
--
-- One relation contract instead of a new foreign key for every future
-- Passport experience:  (from) --relation--> (to), with a status that
-- distinguishes pending / active / suspended / ended / declined and keeps
-- history (an ended relationship is never deleted).
--
-- A relationship is INFORMATION. It is never an access decision: no policy
-- or function in Passport reads this table to grant anything. `guardian_of`,
-- `owns` and `authorized_for` describe; AUTHORITY acts, and is a separate
-- assignment. (tests/db asserts a live mentor_of grants nothing.)
--
-- Two sources, one shape:
--   1. passport_relationships — NATIVE rows, for relation types with no
--      existing home in Flow and whose both ends can consent:
--         mentor_of       person       -> person   (mentee must accept)
--         participates_in organization -> event    (event owner must accept)
--      Every other relation type is either
--         - managed elsewhere (works_at/member_of/owns/attended/connected_with
--           already live in organization_members, event_attendance,
--           activity_participants, creative_project_members, connections and
--           are ADAPTED read-only below — no copy, no dual write), or
--         - not yet available: guardian_of (awaits the Youth/Guardian consent
--           model), authorized_for / approved_for / works_on / issued_to (their
--           subjects — vehicles, assets, venues, teams, programs — have no
--           ownership resolver yet). These are refused, not faked.
--   2. passport_relationships_legacy — a security_invoker VIEW over the legacy
--      tables. Because it runs with the caller's rights, each source table's
--      own RLS still decides what the caller can see: the view can expose
--      nothing the caller couldn't already read directly.
--
-- Rollback:
--   drop view if exists public.passport_relationships_legacy;
--   drop function if exists public.passport_end_relationship(uuid, text);
--   drop function if exists public.passport_respond_relationship(uuid, boolean);
--   drop function if exists public.passport_propose_relationship(text, uuid, text, text, uuid, jsonb);
--   drop table if exists public.passport_relationships;
--   drop function if exists public.passport_relation_rule(text);
--   drop function if exists public.passport_relationship_transition_allowed(text, text);

create or replace function public.passport_relationship_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select exists (
    select 1 from (values
      ('pending', 'active'), ('pending', 'declined'), ('pending', 'ended'),
      ('active', 'suspended'), ('active', 'ended'),
      ('suspended', 'active'), ('suspended', 'ended')
    ) as t(from_status, to_status)
    where t.from_status = p_from and t.to_status = p_to
  );
$$;

-- Native relation rules: which relation may connect which subject types, and
-- whether it can be created natively yet. (mirrored in lib/passport/domain)
create or replace function public.passport_relation_rule(p_relation text)
returns table (from_type text, to_type text, available boolean, managed_elsewhere boolean)
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select t.from_type, t.to_type, t.available, t.managed_elsewhere
  from (values
    ('mentor_of', 'person', 'person', true, false),
    ('participates_in', 'organization', 'event', true, false),
    ('guardian_of', 'person', 'person', false, false),
    ('authorized_for', 'person', 'vehicle', false, false),
    ('approved_for', 'vehicle', 'event', false, false),
    ('works_on', 'team', 'project', false, false),
    ('issued_to', 'program', 'person', false, false),
    ('works_at', 'person', 'organization', false, true),
    ('member_of', 'person', 'organization', false, true),
    ('owns', 'person', 'organization', false, true),
    ('attended', 'person', 'event', false, true),
    ('connected_with', 'person', 'person', false, true)
  ) as t(relation, from_type, to_type, available, managed_elsewhere)
  where t.relation = p_relation;
$$;

grant execute on function public.passport_relationship_transition_allowed(text, text) to anon, authenticated, service_role;
grant execute on function public.passport_relation_rule(text) to anon, authenticated, service_role;

create table public.passport_relationships (
  id uuid primary key default gen_random_uuid(),
  from_type text not null check (public.passport_subject_type_ok(from_type)),
  from_id uuid not null,
  relation text not null check (relation in (
    'works_at', 'member_of', 'guardian_of', 'mentor_of', 'owns', 'authorized_for',
    'participates_in', 'works_on', 'issued_to', 'approved_for', 'attended', 'connected_with'
  )),
  to_type text not null check (public.passport_subject_type_ok(to_type)),
  to_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'ended', 'declined')),
  started_at timestamptz,
  ended_at timestamptz,
  ended_reason text check (ended_reason is null or char_length(ended_reason) <= 200),
  proposed_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  source_system text not null default 'flow_platform' check (char_length(source_system) between 1 and 64),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passport_relationships_no_self check (not (from_type = to_type and from_id = to_id)),
  constraint passport_relationships_ended_shape check ((status = 'ended') = (ended_at is not null)),
  constraint passport_relationships_started_shape check (status not in ('active', 'suspended') or started_at is not null)
);

create index passport_relationships_from_idx on public.passport_relationships (from_type, from_id, status);
create index passport_relationships_to_idx on public.passport_relationships (to_type, to_id, status);
create unique index passport_relationships_one_live_idx
  on public.passport_relationships (from_type, from_id, relation, to_type, to_id)
  where status in ('pending', 'active', 'suspended');

create trigger passport_relationships_updated_at before update on public.passport_relationships
  for each row execute function public.set_admin_updated_at();
create trigger passport_relationships_no_delete before delete on public.passport_relationships
  for each row execute function public.passport_no_delete();

create or replace function public.passport_relationships_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.status is distinct from old.status and not public.passport_relationship_transition_allowed(old.status, new.status) then
    raise exception 'illegal relationship transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if new.from_type is distinct from old.from_type or new.from_id is distinct from old.from_id or new.relation is distinct from old.relation
     or new.to_type is distinct from old.to_type or new.to_id is distinct from old.to_id or new.proposed_by is distinct from old.proposed_by then
    raise exception 'relationship identity is immutable' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_relationships_guard_trg before update on public.passport_relationships
  for each row execute function public.passport_relationships_guard();

alter table public.passport_relationships enable row level security;

revoke all on table public.passport_relationships from public, anon, authenticated;
grant select on table public.passport_relationships to authenticated;
grant select on table public.passport_relationships to service_role;

-- Either end's record owner can see the relationship; an AAL2 admin can audit.
-- (Reading a relationship grants nothing — see the header.)
create policy passport_relationships_read on public.passport_relationships for select to authenticated
  using (
    public.passport_subject_owner_ok(from_type, from_id)
    or public.passport_subject_owner_ok(to_type, to_id)
    or public.is_flow_admin(true)
  );

-- Propose a relationship. The caller must own the record of the `from` end;
-- the `to` end's owner must accept unless the same person owns both.
create or replace function public.passport_propose_relationship(
  p_from_type text,
  p_from_id uuid,
  p_relation text,
  p_to_type text,
  p_to_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_from_type text := public.passport_canonical_subject_type(p_from_type);
  v_to_type text := public.passport_canonical_subject_type(p_to_type);
  v_rule record;
  v_id uuid;
  v_both boolean;
  v_status text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_rule from public.passport_relation_rule(p_relation);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_relation');
  end if;
  if v_rule.managed_elsewhere then
    return jsonb_build_object('ok', false, 'reason', 'relation_managed_elsewhere');
  end if;
  if not v_rule.available then
    return jsonb_build_object('ok', false, 'reason', 'relation_not_available');
  end if;
  if v_from_type <> v_rule.from_type or v_to_type <> v_rule.to_type then
    return jsonb_build_object('ok', false, 'reason', 'invalid_relation_endpoints');
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or pg_column_size(p_metadata) > 2048 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_metadata');
  end if;
  if not public.passport_subject_owner_ok(v_from_type, p_from_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_from_type = v_to_type and p_from_id = p_to_id then
    return jsonb_build_object('ok', false, 'reason', 'self_relationship');
  end if;
  if not public.passport_entity_exists(v_to_type, p_to_id)
     and not (v_to_type = 'event' and exists (select 1 from public.events where id = p_to_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Proposing to a person who has blocked (or been blocked by) you looks like a missing person.
  if v_to_type = 'person' and public.is_blocked_between(auth.uid(), p_to_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_both := public.passport_subject_owner_ok(v_to_type, p_to_id);
  v_status := case when v_both then 'active' else 'pending' end;

  begin
    insert into public.passport_relationships (from_type, from_id, relation, to_type, to_id, status, started_at, proposed_by, responded_by, metadata)
    values (v_from_type, p_from_id, p_relation, v_to_type, p_to_id, v_status,
            case when v_both then now() end, auth.uid(), case when v_both then auth.uid() end, p_metadata)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_exists');
  end;

  -- Both parties can read the history: one event per side.
  perform public._passport_emit_event('relationship.created', 'person', auth.uid()::text, v_from_type, p_from_id,
    jsonb_build_object('relationship_id', v_id), jsonb_build_object('relation', p_relation, 'status', v_status, 'to_type', v_to_type, 'to_id', p_to_id));
  perform public._passport_emit_event('relationship.created', 'person', auth.uid()::text, v_to_type, p_to_id,
    jsonb_build_object('relationship_id', v_id), jsonb_build_object('relation', p_relation, 'status', v_status, 'from_type', v_from_type, 'from_id', p_from_id));
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.passport_propose_relationship(text, uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.passport_propose_relationship(text, uuid, text, text, uuid, jsonb) to authenticated;

-- Only the `to` end's record owner can accept or decline.
create or replace function public.passport_respond_relationship(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_rel public.passport_relationships%rowtype; v_new text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_rel from public.passport_relationships where id = p_id for update;
  if not found or not public.passport_subject_owner_ok(v_rel.to_type, v_rel.to_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_rel.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  v_new := case when p_accept then 'active' else 'declined' end;
  update public.passport_relationships
     set status = v_new, responded_by = auth.uid(), started_at = case when p_accept then now() else started_at end
   where id = p_id;
  perform public._passport_emit_event(case when p_accept then 'relationship.accepted' else 'relationship.declined' end,
    'person', auth.uid()::text, v_rel.from_type, v_rel.from_id,
    jsonb_build_object('relationship_id', p_id), jsonb_build_object('relation', v_rel.relation));
  perform public._passport_emit_event(case when p_accept then 'relationship.accepted' else 'relationship.declined' end,
    'person', auth.uid()::text, v_rel.to_type, v_rel.to_id,
    jsonb_build_object('relationship_id', p_id), jsonb_build_object('relation', v_rel.relation));
  return jsonb_build_object('ok', true, 'status', v_new);
end;
$$;

revoke all on function public.passport_respond_relationship(uuid, boolean) from public, anon;
grant execute on function public.passport_respond_relationship(uuid, boolean) to authenticated;

-- Either end can end a relationship; ending keeps the row (history).
create or replace function public.passport_end_relationship(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_rel public.passport_relationships%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_reason is not null and char_length(p_reason) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;
  select * into v_rel from public.passport_relationships where id = p_id for update;
  if not found or not (public.passport_subject_owner_ok(v_rel.from_type, v_rel.from_id) or public.passport_subject_owner_ok(v_rel.to_type, v_rel.to_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.passport_relationship_transition_allowed(v_rel.status, 'ended') then
    return jsonb_build_object('ok', false, 'reason', 'not_endable');
  end if;
  update public.passport_relationships set status = 'ended', ended_at = now(), ended_reason = p_reason where id = p_id;
  perform public._passport_emit_event('relationship.ended', 'person', auth.uid()::text, v_rel.from_type, v_rel.from_id,
    jsonb_build_object('relationship_id', p_id), jsonb_build_object('relation', v_rel.relation, 'was', v_rel.status));
  perform public._passport_emit_event('relationship.ended', 'person', auth.uid()::text, v_rel.to_type, v_rel.to_id,
    jsonb_build_object('relationship_id', p_id), jsonb_build_object('relation', v_rel.relation, 'was', v_rel.status));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_end_relationship(uuid, text) from public, anon;
grant execute on function public.passport_end_relationship(uuid, text) to authenticated;

-- ── legacy relationships, adapted read-only ─────────────────────────────
-- security_invoker: each source table's own RLS still applies to the caller,
-- so this view exposes nothing they couldn't already read. Blocked
-- connections are excluded entirely — a block is never a "relationship".
create view public.passport_relationships_legacy
with (security_invoker = true) as
  -- organization membership (ROLE is deliberately not projected: a role is not a relationship type)
  select 'person'::text as from_type, m.profile_id as from_id,
         case when m.role = 'owner' then 'owns' else 'member_of' end as relation,
         'organization'::text as to_type, m.organization_id as to_id,
         case m.status when 'invited' then 'pending' when 'active' then 'active' when 'suspended' then 'suspended' else 'ended' end as status,
         m.joined_at as started_at, m.removed_at as ended_at,
         'organization_members'::text as origin_table, m.id::text as origin_id
    from public.organization_members m
  union all
  -- event attendance: only attendance that actually happened
  select 'person', a.profile_id, 'attended', 'event', a.event_id, 'active',
         a.checked_in_at, null::timestamptz, 'event_attendance', a.event_id::text || ':' || a.profile_id::text
    from public.event_attendance a where a.status = 'attended'
  union all
  select 'person', p.profile_id, 'participates_in', 'activity', p.activity_id,
         case p.status when 'registered' then 'pending' when 'attended' then 'active' when 'completed' then 'active' else 'ended' end,
         p.checked_in_at, case when p.status in ('cancelled', 'no_show') then coalesce(p.cancelled_at, p.updated_at) end,
         'activity_participants', p.id::text
    from public.activity_participants p
  union all
  select 'person', cm.profile_id, 'member_of', 'project', cm.project_id,
         case cm.status when 'invited' then 'pending' when 'active' then 'active' when 'suspended' then 'suspended' else 'ended' end,
         cm.joined_at, cm.removed_at, 'creative_project_members', cm.id::text
    from public.creative_project_members cm
  union all
  select 'person', c.requester_id, 'connected_with', 'person', c.recipient_id,
         case c.status when 'accepted' then 'active' else 'pending' end,
         c.responded_at, null::timestamptz, 'connections', c.id::text
    from public.connections c where c.status in ('pending', 'accepted');

revoke all on table public.passport_relationships_legacy from public, anon, authenticated;
grant select on table public.passport_relationships_legacy to authenticated;
grant select on table public.passport_relationships_legacy to service_role;
