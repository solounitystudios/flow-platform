-- ============================================================
-- Passport V2 — part 4: consent grants + selective disclosure
-- ============================================================
--
-- Basic public/private visibility is not enough for a Passport that
-- organizations, programs and (eventually) agencies interact with. A consent
-- grant is the canonical, auditable answer to "who may see what of mine, for
-- what, until when":
--
--     REQUEST -> APPROVE / DECLINE -> ACTIVE -> EXPIRE / REVOKE
--
-- Rules enforced here, in the database:
--   * Purpose-bound and minimised. A request names one purpose and may only ask
--     for the data categories that purpose allows (a hiring review can never
--     ask for `location`; event entry can never ask for `work_history`).
--   * Requesting on behalf of an organization needs an explicit, purpose-
--     scoped `data_requester` authority — org ownership or a membership role
--     is not enough (ROLE != AUTHORITY). Requests can't come from entities
--     with no ownership resolver (agencies, programs...): no path exists for
--     unrestricted government/agency access.
--   * Only the grantor decides. Approval may narrow, never widen; every grant
--     is time-limited (<= 365 days). Grantors are people in this wave —
--     organization/agency grantors need a consent-signing authority model that
--     does not exist yet, so they are refused rather than faked.
--   * Callers receive ANSWERS, not data. passport_disclose() returns
--     "claim_valid: yes/no" or "credential_held: yes/no" (+ the expiry when
--     the claim is currently valid) — never claim values, evidence or ids.
--     Only questions today's data can answer honestly exist; there is no DOB
--     in Flow, so "is this person 18+?" is deliberately NOT offered.
--   * Every consequential step writes an audit event in the same transaction;
--     each disclosure leaves a `credential.shared` event the subject can read.
--
-- No scheduler is configured: expiry is enforced at use (every RPC checks
-- expires_at) and materialised by passport_expire_due_consents() (safe to call
-- any time, idempotent), which the data layer invokes opportunistically.
--
-- Rollback:
--   drop function if exists public.passport_disclose(uuid, text, text, text);
--   drop function if exists public.passport_expire_due_consents();
--   drop function if exists public.passport_revoke_consent(uuid, text);
--   drop function if exists public.passport_withdraw_consent_request(uuid);
--   drop function if exists public.passport_respond_consent(uuid, boolean, text[], timestamptz);
--   drop function if exists public.passport_request_consent(uuid, text, uuid, text, text[], text, uuid);
--   drop table if exists public.passport_consent_grants;
--   drop function if exists public.passport_can_request_as(text, uuid, text);
--   drop function if exists public.passport_claim_category(text);
--   drop function if exists public.passport_purpose_allows_category(text, text);
--   drop function if exists public.passport_data_category_ok(text);
--   drop function if exists public.passport_consent_transition_allowed(text, text);

-- ── A. vocabulary + policy tables (mirrored in lib/passport/domain) ──────

create or replace function public.passport_data_category_ok(p_category text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select p_category in ('credentials', 'skills', 'work_history', 'attendance', 'reliability', 'recommendations',
                        'identity_attributes', 'evidence_artifacts', 'contact', 'location');
$$;

create or replace function public.passport_purpose_allows_category(p_purpose text, p_category text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select exists (
    select 1 from (values
      ('hiring_review', 'credentials'), ('hiring_review', 'skills'), ('hiring_review', 'work_history'),
      ('hiring_review', 'reliability'), ('hiring_review', 'recommendations'), ('hiring_review', 'attendance'),
      ('hiring_review', 'contact'), ('hiring_review', 'evidence_artifacts'),
      ('credential_check', 'credentials'),
      ('event_entry', 'credentials'), ('event_entry', 'identity_attributes'), ('event_entry', 'attendance'),
      ('program_enrollment', 'credentials'), ('program_enrollment', 'skills'), ('program_enrollment', 'attendance'),
      ('program_enrollment', 'identity_attributes'), ('program_enrollment', 'contact'),
      ('capture_request', 'evidence_artifacts'), ('capture_request', 'location'),
      ('mentorship', 'skills'), ('mentorship', 'credentials'), ('mentorship', 'recommendations')
    ) as t(purpose, category)
    where t.purpose = p_purpose and t.category = p_category
  );
$$;

create or replace function public.passport_consent_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select exists (
    select 1 from (values
      ('requested', 'active'), ('requested', 'declined'), ('requested', 'withdrawn'), ('requested', 'expired'),
      ('active', 'revoked'), ('active', 'expired')
    ) as t(from_status, to_status)
    where t.from_status = p_from and t.to_status = p_to
  );
$$;

-- Which consent category a claim type falls under (NULL = not disclosable via consent).
create or replace function public.passport_claim_category(p_claim_type text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select case
    when p_claim_type like 'credential.%' then 'credentials'
    when p_claim_type like 'skill.%' then 'skills'
    when p_claim_type like 'attendance.%' then 'attendance'
    when p_claim_type like 'participation.%' then 'attendance'
    when p_claim_type like 'attestation.%' then 'recommendations'
    else null
  end;
$$;

grant execute on function public.passport_data_category_ok(text) to anon, authenticated, service_role;
grant execute on function public.passport_purpose_allows_category(text, text) to anon, authenticated, service_role;
grant execute on function public.passport_consent_transition_allowed(text, text) to anon, authenticated, service_role;
grant execute on function public.passport_claim_category(text) to anon, authenticated, service_role;

-- May the CALLER act as this grantee for this purpose? People may request only
-- for mentorship, on their own behalf. Organizations need an explicit
-- `data_requester` authority scoped to the purpose. Everything else: no.
create or replace function public.passport_can_request_as(p_grantee_type text, p_grantee_id uuid, p_purpose text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select auth.uid() is not null and case p_grantee_type
    when 'person' then p_grantee_id = auth.uid() and p_purpose = 'mentorship'
    when 'organization' then public.passport_has_authority('organization', p_grantee_id, 'data_requester', p_purpose)
    else false
  end;
$$;

revoke all on function public.passport_can_request_as(text, uuid, text) from public, anon;
grant execute on function public.passport_can_request_as(text, uuid, text) to authenticated, service_role;

-- ── B. grants ────────────────────────────────────────────────────────────

create table public.passport_consent_grants (
  id uuid primary key default gen_random_uuid(),
  grantor_type text not null check (public.passport_subject_type_ok(grantor_type)),
  grantor_id uuid not null,
  grantee_type text not null check (public.passport_subject_type_ok(grantee_type)),
  grantee_id uuid not null,
  subject_type text not null check (public.passport_subject_type_ok(subject_type)),
  subject_id uuid not null,
  purpose text not null check (purpose in ('hiring_review', 'credential_check', 'event_entry', 'program_enrollment', 'capture_request', 'mentorship')),
  requested_categories text[] not null check (
    cardinality(requested_categories) between 1 and 10
    and requested_categories <@ array['credentials','skills','work_history','attendance','reliability','recommendations','identity_attributes','evidence_artifacts','contact','location']
  ),
  approved_categories text[] not null default '{}' check (approved_categories <@ requested_categories),
  context_type text check (context_type is null or char_length(context_type) between 1 and 32),
  context_id uuid,
  status text not null default 'requested' check (status in ('requested', 'active', 'declined', 'revoked', 'expired', 'withdrawn')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  -- While `requested`: when the request lapses. Once `active`: when the grant ends.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text check (revoke_reason is null or char_length(revoke_reason) <= 200),
  created_at timestamptz not null default now(),
  constraint passport_consent_context_pair check ((context_type is null) = (context_id is null)),
  constraint passport_consent_no_self check (not (grantor_type = grantee_type and grantor_id = grantee_id)),
  constraint passport_consent_active_shape check (status <> 'active' or (cardinality(approved_categories) >= 1 and decided_at is not null)),
  constraint passport_consent_revoked_shape check ((status = 'revoked') = (revoked_at is not null))
);

create index passport_consent_grantor_idx on public.passport_consent_grants (grantor_type, grantor_id, status);
create index passport_consent_grantee_idx on public.passport_consent_grants (grantee_type, grantee_id, status);
-- One open request/grant per (grantor, grantee, purpose, context): no request spam.
create unique index passport_consent_one_open_idx
  on public.passport_consent_grants (grantor_id, grantee_type, grantee_id, purpose, coalesce(context_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('requested', 'active');

alter table public.passport_consent_grants enable row level security;

revoke all on table public.passport_consent_grants from public, anon, authenticated;
grant select on table public.passport_consent_grants to authenticated;
grant select on table public.passport_consent_grants to service_role;

-- The grantor sees requests about them; the requesting entity's authorized
-- principals see what they asked for; an AAL2 admin can audit.
create policy passport_consent_read on public.passport_consent_grants for select to authenticated
  using (
    (grantor_type = 'person' and grantor_id = (select auth.uid()))
    or public.passport_can_request_as(grantee_type, grantee_id, purpose)
    or public.is_flow_admin(true)
  );

-- Grants never lose history: no deletes; status changes only along the lifecycle.
create trigger passport_consent_no_delete before delete on public.passport_consent_grants
  for each row execute function public.passport_no_delete();

create or replace function public.passport_consent_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.status is distinct from old.status and not public.passport_consent_transition_allowed(old.status, new.status) then
    raise exception 'illegal consent transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- What was asked, of whom, by whom, and for what never changes.
  if new.grantor_type is distinct from old.grantor_type or new.grantor_id is distinct from old.grantor_id
     or new.grantee_type is distinct from old.grantee_type or new.grantee_id is distinct from old.grantee_id
     or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
     or new.purpose is distinct from old.purpose or new.requested_categories is distinct from old.requested_categories
     or new.requested_at is distinct from old.requested_at or new.requested_by is distinct from old.requested_by then
    raise exception 'consent grant terms are immutable' using errcode = 'restrict_violation';
  end if;
  -- Approved scope is fixed once the grant is decided.
  if old.status <> 'requested' and new.approved_categories is distinct from old.approved_categories then
    raise exception 'approved scope is immutable once decided' using errcode = 'restrict_violation';
  end if;
  -- An active grant's window can never be extended in place; renew with a new request.
  if old.status = 'active' and new.expires_at > old.expires_at then
    raise exception 'an active grant cannot be extended' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_consent_guard_trg before update on public.passport_consent_grants
  for each row execute function public.passport_consent_guard();

-- ── C. RPCs ──────────────────────────────────────────────────────────────

create or replace function public.passport_request_consent(
  p_grantor uuid,
  p_grantee_type text,
  p_grantee_id uuid,
  p_purpose text,
  p_categories text[],
  p_context_type text default null,
  p_context_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_grantee_type text := public.passport_canonical_subject_type(p_grantee_type);
  v_categories text[] := coalesce(p_categories, '{}');
  v_category text;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_purpose not in ('hiring_review', 'credential_check', 'event_entry', 'program_enrollment', 'capture_request', 'mentorship') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_purpose');
  end if;
  if cardinality(v_categories) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_categories');
  end if;
  if (select count(distinct c) from unnest(v_categories) c) <> cardinality(v_categories) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_category');
  end if;
  foreach v_category in array v_categories loop
    if not public.passport_data_category_ok(v_category) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_category');
    end if;
    if not public.passport_purpose_allows_category(p_purpose, v_category) then
      return jsonb_build_object('ok', false, 'reason', 'category_not_allowed_for_purpose');
    end if;
  end loop;
  if (p_context_type is null) <> (p_context_id is null) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_context');
  end if;

  -- Only people can be asked in this wave.
  if not exists (select 1 from public.profiles where id = p_grantor) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.passport_can_request_as(v_grantee_type, p_grantee_id, p_purpose) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_grantee_type = 'person' and p_grantee_id = p_grantor then
    return jsonb_build_object('ok', false, 'reason', 'self_request');
  end if;
  -- A blocked pair gets the same answer as a missing person: no oracle.
  if public.is_blocked_between(auth.uid(), p_grantor) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Anti-spam: bounded requests per requester per day.
  if (select count(*) from public.passport_consent_grants where requested_by = auth.uid() and requested_at > now() - interval '1 day') >= 25 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  begin
    insert into public.passport_consent_grants
      (grantor_type, grantor_id, grantee_type, grantee_id, subject_type, subject_id, purpose, requested_categories,
       context_type, context_id, requested_by, expires_at)
    values
      ('person', p_grantor, v_grantee_type, p_grantee_id, 'person', p_grantor, p_purpose, v_categories,
       p_context_type, p_context_id, auth.uid(), now() + interval '14 days')
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_open');
  end;

  perform public._passport_emit_event('consent.requested', 'person', auth.uid()::text, 'person', p_grantor,
    jsonb_build_object('consent_id', v_id),
    jsonb_build_object('purpose', p_purpose, 'categories', to_jsonb(v_categories), 'grantee_type', v_grantee_type, 'grantee_id', p_grantee_id));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.passport_request_consent(uuid, text, uuid, text, text[], text, uuid) from public, anon;
grant execute on function public.passport_request_consent(uuid, text, uuid, text, text[], text, uuid) to authenticated;

create or replace function public.passport_respond_consent(
  p_id uuid,
  p_approve boolean,
  p_approved_categories text[] default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_grant public.passport_consent_grants%rowtype;
  v_approved text[];
  v_expires timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_grant from public.passport_consent_grants where id = p_id for update;
  -- Only the grantor may decide; anyone else is told "not found".
  if not found or v_grant.grantor_type <> 'person' or v_grant.grantor_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_grant.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  if v_grant.expires_at <= now() then
    update public.passport_consent_grants set status = 'expired' where id = p_id;
    perform public._passport_emit_event('consent.expired', 'system', 'passport', 'person', v_grant.grantor_id,
      jsonb_build_object('consent_id', p_id), jsonb_build_object('was', 'requested'));
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;

  if not p_approve then
    update public.passport_consent_grants set status = 'declined', decided_at = now(), decided_by = auth.uid() where id = p_id;
    perform public._passport_emit_event('consent.declined', 'person', auth.uid()::text, 'person', v_grant.grantor_id,
      jsonb_build_object('consent_id', p_id), jsonb_build_object('purpose', v_grant.purpose));
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- Approval may narrow the request, never widen it.
  v_approved := coalesce(p_approved_categories, v_grant.requested_categories);
  if cardinality(v_approved) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_approved');
  end if;
  if not (v_approved <@ v_grant.requested_categories) then
    return jsonb_build_object('ok', false, 'reason', 'approved_exceeds_request');
  end if;
  v_expires := coalesce(p_expires_at, now() + interval '90 days');
  if v_expires <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expiry_not_in_future');
  end if;
  if v_expires > now() + interval '365 days' then
    return jsonb_build_object('ok', false, 'reason', 'expiry_too_far');
  end if;

  update public.passport_consent_grants
     set status = 'active', approved_categories = v_approved, decided_at = now(), decided_by = auth.uid(), expires_at = v_expires
   where id = p_id;
  perform public._passport_emit_event('consent.granted', 'person', auth.uid()::text, 'person', v_grant.grantor_id,
    jsonb_build_object('consent_id', p_id),
    jsonb_build_object('purpose', v_grant.purpose, 'categories', to_jsonb(v_approved), 'expires_at', v_expires,
                       'grantee_type', v_grant.grantee_type, 'grantee_id', v_grant.grantee_id));
  return jsonb_build_object('ok', true, 'status', 'active', 'expires_at', v_expires);
end;
$$;

revoke all on function public.passport_respond_consent(uuid, boolean, text[], timestamptz) from public, anon;
grant execute on function public.passport_respond_consent(uuid, boolean, text[], timestamptz) to authenticated;

-- The requester may withdraw a request that hasn't been decided.
create or replace function public.passport_withdraw_consent_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_grant public.passport_consent_grants%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_grant from public.passport_consent_grants where id = p_id for update;
  if not found or not public.passport_can_request_as(v_grant.grantee_type, v_grant.grantee_id, v_grant.purpose) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_grant.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  update public.passport_consent_grants set status = 'withdrawn' where id = p_id;
  perform public._passport_emit_event('consent.withdrawn', 'person', auth.uid()::text, 'person', v_grant.grantor_id,
    jsonb_build_object('consent_id', p_id), jsonb_build_object('purpose', v_grant.purpose));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_withdraw_consent_request(uuid) from public, anon;
grant execute on function public.passport_withdraw_consent_request(uuid) to authenticated;

-- The grantor can pull access at any time; effect is immediate.
create or replace function public.passport_revoke_consent(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_grant public.passport_consent_grants%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_reason is not null and char_length(p_reason) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;
  select * into v_grant from public.passport_consent_grants where id = p_id for update;
  if not found or v_grant.grantor_type <> 'person' or v_grant.grantor_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_grant.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  update public.passport_consent_grants set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason where id = p_id;
  perform public._passport_emit_event('consent.revoked', 'person', auth.uid()::text, 'person', v_grant.grantor_id,
    jsonb_build_object('consent_id', p_id), jsonb_build_object('purpose', v_grant.purpose));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_revoke_consent(uuid, text) from public, anon;
grant execute on function public.passport_revoke_consent(uuid, text) to authenticated;

create or replace function public.passport_expire_due_consents()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare r record; n integer := 0;
begin
  for r in
    update public.passport_consent_grants set status = 'expired'
     where status in ('requested', 'active') and expires_at <= now()
    returning id, grantor_id, purpose, approved_categories
  loop
    perform public._passport_emit_event('consent.expired', 'system', 'passport', 'person', r.grantor_id,
      jsonb_build_object('consent_id', r.id), jsonb_build_object('purpose', r.purpose));
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.passport_expire_due_consents() from public, anon;
grant execute on function public.passport_expire_due_consents() to authenticated, service_role;

-- ── D. selective disclosure ──────────────────────────────────────────────
-- ANSWERS, never data. The grantee (through an authorized principal) asks a
-- narrow question under an active grant that covers the relevant category.
-- Nothing returned identifies a claim, a value, evidence or an issuer.

create or replace function public.passport_disclose(
  p_grant_id uuid,
  p_question text,
  p_claim_type text default null,
  p_credential_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_grant public.passport_consent_grants%rowtype;
  v_category text;
  v_answer boolean := false;
  v_expires timestamptz := null;
  v_claim public.passport_claims%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_grant from public.passport_consent_grants where id = p_grant_id;
  -- Only the grantee's authorized principals may ask; everyone else is told nothing exists.
  if not found or not public.passport_can_request_as(v_grant.grantee_type, v_grant.grantee_id, v_grant.purpose) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_grant.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  if v_grant.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if public.is_blocked_between(auth.uid(), v_grant.grantor_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  if p_question = 'claim_valid' then
    v_category := public.passport_claim_category(p_claim_type);
    if p_claim_type is null or v_category is null then
      return jsonb_build_object('ok', false, 'reason', 'unsupported_claim_type');
    end if;
    if not (v_category = any (v_grant.approved_categories)) then
      return jsonb_build_object('ok', false, 'reason', 'category_not_approved');
    end if;
    -- The most recently verified, currently valid claim of exactly this type.
    select * into v_claim from public.passport_claims c
     where c.subject_type = v_grant.subject_type and c.subject_id = v_grant.subject_id
       and c.claim_type = p_claim_type and c.status = 'verified'
       and (c.expires_at is null or c.expires_at > now())
       -- Sensitive/restricted claims (e.g. identity) need an explicit identity_attributes approval.
       and (c.sensitivity = 'standard' or 'identity_attributes' = any (v_grant.approved_categories))
     order by c.effective_at desc nulls last, c.created_at desc
     limit 1;
    if found then
      v_answer := true;
      v_expires := v_claim.expires_at;
    end if;
  elsif p_question = 'credential_held' then
    -- Legacy Passport credential badges (profile_credentials), until they migrate.
    if p_credential_type is null or char_length(p_credential_type) > 64 then
      return jsonb_build_object('ok', false, 'reason', 'unsupported_claim_type');
    end if;
    if not ('credentials' = any (v_grant.approved_categories)) then
      return jsonb_build_object('ok', false, 'reason', 'category_not_approved');
    end if;
    select exists (
      select 1 from public.profile_credentials pc
       where pc.profile_id = v_grant.subject_id and pc.credential_type = p_credential_type and pc.revoked_at is null
    ) into v_answer;
  else
    -- e.g. "is this person 18+?" — Flow holds no date of birth, so it is not offered.
    return jsonb_build_object('ok', false, 'reason', 'unsupported_question');
  end if;

  perform public._passport_emit_event('credential.shared', 'person', auth.uid()::text, v_grant.subject_type, v_grant.subject_id,
    jsonb_build_object('consent_id', p_grant_id),
    jsonb_build_object('question', p_question, 'claim_type', p_claim_type, 'credential_type', p_credential_type, 'answer', v_answer,
                       'grantee_type', v_grant.grantee_type, 'grantee_id', v_grant.grantee_id));

  return jsonb_build_object('ok', true, 'question', p_question, 'grant_id', p_grant_id, 'answer', v_answer,
                            'expires_at', v_expires, 'evaluated_at', now());
end;
$$;

revoke all on function public.passport_disclose(uuid, text, text, text) from public, anon;
grant execute on function public.passport_disclose(uuid, text, text, text) to authenticated;
