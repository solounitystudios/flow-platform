-- ============================================================
-- Passport V2 — part 6: Capture requests + Integration Gateway persistence
-- ============================================================
--
-- Flow Creative Capture is an EVIDENCE PRODUCER; Passport is the evidence +
-- claim authority. This migration is the Passport side of that boundary:
--
--   Flow user/entity ──create──> passport_capture_requests
--   Capture (over the signed gateway) ──reads/reports──> the request
--   Capture ──EvidencePackage──> passport_gateway_ingest_evidence_package()
--        -> validates, records UNVERIFIED evidence, completes the request.
--
-- Nothing here lets a connector write a Passport table: every gateway
-- function is SECURITY DEFINER and granted to service_role ONLY, takes the
-- authenticated client id from the server (never from the payload), and
-- enforces every rule itself — request exists / is open / is unexpired,
-- subject matches, data policies (location, operator identity, required
-- metadata) are honoured, retries are idempotent, a same-key/different-body
-- retry is a conflict. Receiving a package NEVER creates or verifies a claim:
-- Passport decides what happens next.
--
-- Also here: the replay-protection nonce ledger, the idempotency receipts,
-- IntegrationConnection health (platform-level for Capture), and a relaxation
-- of passport_events so platform-scope events (integration health) can exist
-- without a subject — visible to AAL2 admins only.
--
-- Deployment configuration required (NOT committed): the gateway route
-- handlers need SUPABASE_SERVICE_ROLE_KEY and PASSPORT_GATEWAY_CLIENTS. Without
-- them they answer 503 not_configured; they never fall back to anything weaker.
--
-- Rollback (reverse order):
--   drop function if exists public.passport_gateway_record_connection_result(text, boolean, text);
--   drop function if exists public.passport_gateway_get_evidence_summary(text, uuid);
--   drop function if exists public.passport_gateway_ingest_evidence_package(text, jsonb, text);
--   drop function if exists public.passport_gateway_report_capture_status(text, jsonb, text);
--   drop function if exists public.passport_gateway_get_capture_request(uuid);
--   drop function if exists public.passport_gateway_consume_nonce(text, text, integer);
--   drop function if exists public.passport_expire_due_capture_requests();
--   drop function if exists public.passport_cancel_capture_request(uuid);
--   drop function if exists public.passport_create_capture_request(text, uuid, text, text, text, uuid, text[], text, text, uuid, integer, text);
--   drop table if exists public.passport_integration_connections, public.passport_gateway_nonces,
--     public.passport_gateway_receipts, public.passport_capture_requests;
--   (and helper functions passport_capture_*; the two subject-nullable ALTERs on passport_events
--    can stay — they only relax a NOT NULL.)

-- ── A. platform-scope events (no subject) ────────────────────────────────
-- Connection health events describe the integration, not a person. Relax the
-- ledger's subject columns to allow that; RLS already limits subject-less rows
-- to AAL2 admins (passport_subject_owner_ok(null, null) is false).
alter table public.passport_events alter column subject_type drop not null;
alter table public.passport_events alter column subject_id drop not null;
alter table public.passport_events add constraint passport_events_subject_pair check ((subject_type is null) = (subject_id is null));

-- ── B. capture policy tables (mirrored in lib/passport/domain) ───────────

create or replace function public.passport_capture_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select exists (
    select 1 from (values
      ('requested', 'accepted'), ('requested', 'started'), ('requested', 'completed'), ('requested', 'failed'), ('requested', 'cancelled'), ('requested', 'expired'),
      ('accepted', 'started'), ('accepted', 'completed'), ('accepted', 'failed'), ('accepted', 'cancelled'), ('accepted', 'expired'),
      ('started', 'completed'), ('started', 'failed'), ('started', 'cancelled'), ('started', 'expired')
    ) as t(from_status, to_status)
    where t.from_status = p_from and t.to_status = p_to
  );
$$;

grant execute on function public.passport_capture_transition_allowed(text, text) to anon, authenticated, service_role;

-- Is `p_related` something this PERSON really participates in? A capture may
-- only reference an object the subject is genuinely part of.
create or replace function public.passport_capture_related_ok(p_subject_id uuid, p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select case p_type
    when 'application' then exists (select 1 from public.applications a where a.id = p_id and a.applicant_id = p_subject_id)
    when 'opportunity' then exists (select 1 from public.applications a where a.opportunity_id = p_id and a.applicant_id = p_subject_id)
    when 'activity' then exists (select 1 from public.activity_participants ap where ap.activity_id = p_id and ap.profile_id = p_subject_id and ap.status in ('attended', 'completed'))
    when 'event' then exists (select 1 from public.event_attendance ea where ea.event_id = p_id and ea.profile_id = p_subject_id and ea.status = 'attended')
    when 'project' then exists (select 1 from public.creative_project_members m where m.project_id = p_id and m.profile_id = p_subject_id and m.status = 'active')
    else false   -- 'work_item' has no backing table yet: refused, not faked
  end;
$$;

revoke all on function public.passport_capture_related_ok(uuid, text, uuid) from public, anon;
grant execute on function public.passport_capture_related_ok(uuid, text, uuid) to authenticated, service_role;

-- ── C. capture requests ──────────────────────────────────────────────────

create table public.passport_capture_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (public.passport_subject_type_ok(subject_type)),
  subject_id uuid not null,
  requester_type text not null check (public.passport_subject_type_ok(requester_type)),
  requester_id uuid not null,
  requested_by uuid references public.profiles(id) on delete set null,
  purpose text not null check (purpose in ('skill_evidence', 'work_completion', 'activity_outcome', 'event_participation', 'project_contribution', 'credential_document')),
  evidence_type text not null check (evidence_type in ('photo', 'video', 'audio', 'document')),
  related_type text check (related_type is null or related_type in ('opportunity', 'application', 'event', 'activity', 'project', 'work_item')),
  related_id uuid,
  required_metadata text[] not null default '{}' check (cardinality(required_metadata) <= 20),
  location_policy text not null default 'forbidden' check (location_policy in ('forbidden', 'optional')),
  operator_identity_policy text not null default 'forbidden' check (operator_identity_policy in ('forbidden', 'optional')),
  consent_basis text not null check (consent_basis in ('subject_initiated', 'consent_grant')),
  consent_grant_id uuid references public.passport_consent_grants(id),
  status text not null default 'requested' check (status in ('requested', 'accepted', 'started', 'completed', 'failed', 'cancelled', 'expired')),
  expires_at timestamptz not null,
  capture_session_id text check (capture_session_id is null or capture_session_id ~ '^[A-Za-z0-9._:\-]{1,128}$'),
  failure_reason text check (failure_reason is null or failure_reason in ('user_declined', 'permission_denied', 'device_error', 'upload_failed', 'timeout', 'other')),
  correlation_id text not null default gen_random_uuid()::text check (correlation_id ~ '^[A-Za-z0-9._:\-]{1,128}$'),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:\-]{8,128}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint passport_capture_related_pair check ((related_type is null) = (related_id is null)),
  constraint passport_capture_consent_shape check ((consent_basis = 'consent_grant') = (consent_grant_id is not null)),
  constraint passport_capture_failed_shape check ((status = 'failed') = (failure_reason is not null)),
  unique (requested_by, idempotency_key)
);

create index passport_capture_subject_idx on public.passport_capture_requests (subject_type, subject_id, status);
create index passport_capture_open_idx on public.passport_capture_requests (expires_at) where status in ('requested', 'accepted', 'started');

create trigger passport_capture_requests_updated_at before update on public.passport_capture_requests
  for each row execute function public.set_admin_updated_at();
create trigger passport_capture_requests_no_delete before delete on public.passport_capture_requests
  for each row execute function public.passport_no_delete();

create or replace function public.passport_capture_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.status is distinct from old.status and not public.passport_capture_transition_allowed(old.status, new.status) then
    raise exception 'illegal capture request transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- What was asked, for whom, under what policy never changes.
  if new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
     or new.requester_type is distinct from old.requester_type or new.requester_id is distinct from old.requester_id
     or new.purpose is distinct from old.purpose or new.evidence_type is distinct from old.evidence_type
     or new.related_type is distinct from old.related_type or new.related_id is distinct from old.related_id
     or new.required_metadata is distinct from old.required_metadata
     or new.location_policy is distinct from old.location_policy or new.operator_identity_policy is distinct from old.operator_identity_policy
     or new.consent_basis is distinct from old.consent_basis or new.consent_grant_id is distinct from old.consent_grant_id
     or new.expires_at is distinct from old.expires_at or new.created_at is distinct from old.created_at
     or new.idempotency_key is distinct from old.idempotency_key or new.correlation_id is distinct from old.correlation_id then
    raise exception 'capture request terms are immutable' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_capture_guard_trg before update on public.passport_capture_requests
  for each row execute function public.passport_capture_guard();

-- Now that capture requests exist, link evidence to them.
alter table public.passport_evidence
  add constraint passport_evidence_capture_request_fk foreign key (capture_request_id) references public.passport_capture_requests(id);

alter table public.passport_capture_requests enable row level security;
revoke all on table public.passport_capture_requests from public, anon, authenticated;
grant select on table public.passport_capture_requests to authenticated;
grant select on table public.passport_capture_requests to service_role;

create policy passport_capture_read on public.passport_capture_requests for select to authenticated
  using (
    public.passport_subject_owner_ok(subject_type, subject_id)
    or requested_by = (select auth.uid())
    or public.is_flow_admin(true)
  );

-- ── D. gateway support tables (service_role only; no client policy at all) ─

-- Replay protection: a signed request's nonce can be used exactly once.
create table public.passport_gateway_nonces (
  client_id text not null check (client_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  nonce text not null check (char_length(nonce) between 16 and 64),
  expires_at timestamptz not null,
  primary key (client_id, nonce)
);
create index passport_gateway_nonces_expiry_idx on public.passport_gateway_nonces (expires_at);

-- Idempotency receipts: what a (client, kind, key) delivery produced.
create table public.passport_gateway_receipts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (client_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  kind text not null check (kind in ('evidence_package', 'status_report')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9._:\-]{8,128}$'),
  object_key text,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (client_id, kind, idempotency_key)
);

create or replace function public.passport_append_only()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception '% is append-only (% is not permitted)', tg_table_name, tg_op using errcode = 'restrict_violation';
end;
$$;

create trigger passport_gateway_receipts_append_only before update or delete on public.passport_gateway_receipts
  for each row execute function public.passport_append_only();

alter table public.passport_gateway_nonces enable row level security;
alter table public.passport_gateway_receipts enable row level security;
revoke all on table public.passport_gateway_nonces, public.passport_gateway_receipts from public, anon, authenticated;
grant select on table public.passport_gateway_receipts to service_role;
-- (no client policies: only the service_role RPCs below ever touch these)

-- ── E. integration connections ───────────────────────────────────────────

create table public.passport_integration_connections (
  id uuid primary key default gen_random_uuid(),
  connector_key text not null check (connector_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  owner_type text check (owner_type is null or public.passport_subject_type_ok(owner_type)),
  owner_id uuid,
  status text not null default 'healthy' check (status in ('healthy', 'stale', 'degraded', 'disconnected', 'auth_required', 'error')),
  scope text[] not null default '{}' check (cardinality(scope) <= 50),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error_category text check (last_error_category is null or last_error_category in ('auth', 'network', 'schema', 'rate_limit', 'source_unavailable', 'rejected', 'unknown')),
  stale_after_seconds integer not null default 604800 check (stale_after_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passport_connections_owner_pair check ((owner_type is null) = (owner_id is null))
);

create unique index passport_connections_one_idx
  on public.passport_integration_connections (connector_key, coalesce(owner_type, ''), coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger passport_connections_updated_at before update on public.passport_integration_connections
  for each row execute function public.set_admin_updated_at();
create trigger passport_connections_no_delete before delete on public.passport_integration_connections
  for each row execute function public.passport_no_delete();

alter table public.passport_integration_connections enable row level security;
revoke all on table public.passport_integration_connections from public, anon, authenticated;
grant select on table public.passport_integration_connections to authenticated;
grant select on table public.passport_integration_connections to service_role;

-- A platform-level connection (owner null) is visible to AAL2 admins only; an
-- owned connection to its owner as well.
create policy passport_connections_read on public.passport_integration_connections for select to authenticated
  using (
    public.is_flow_admin(true)
    or (owner_type is not null and public.passport_subject_owner_ok(owner_type, owner_id))
  );

-- ── F. Flow-side: create / cancel / expire capture requests ──────────────

create or replace function public._passport_expire_capture(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v public.passport_capture_requests%rowtype;
begin
  update public.passport_capture_requests set status = 'expired'
   where id = p_id and status in ('requested', 'accepted', 'started') and expires_at <= now()
  returning * into v;
  if not found then return false; end if;
  perform public._passport_emit_event('capture.expired', 'system', 'passport', v.subject_type, v.subject_id,
    jsonb_build_object('capture_request_id', v.id), jsonb_build_object('purpose', v.purpose));
  return true;
end;
$$;

revoke all on function public._passport_expire_capture(uuid) from public, anon, authenticated;

create or replace function public.passport_create_capture_request(
  p_subject_type text,
  p_subject_id uuid,
  p_purpose text,
  p_evidence_type text,
  p_idempotency_key text,
  p_related_id uuid default null,
  p_required_metadata text[] default '{}',
  p_location_policy text default 'forbidden',
  p_operator_identity_policy text default 'forbidden',
  p_consent_grant_id uuid default null,
  p_ttl_hours integer default 72,
  p_related_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_type text := public.passport_canonical_subject_type(p_subject_type);
  v_grant public.passport_consent_grants%rowtype;
  v_requester_type text;
  v_requester_id uuid;
  v_basis text;
  v_meta text[] := coalesce(p_required_metadata, '{}');
  v_key text;
  v_row public.passport_capture_requests%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_purpose not in ('skill_evidence', 'work_completion', 'activity_outcome', 'event_participation', 'project_contribution', 'credential_document')
     or p_evidence_type not in ('photo', 'video', 'audio', 'document') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:\-]{8,128}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_idempotency_key');
  end if;
  if p_location_policy not in ('forbidden', 'optional') or p_operator_identity_policy not in ('forbidden', 'optional') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  if cardinality(v_meta) > 20 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_request');
  end if;
  foreach v_key in array v_meta loop
    if v_key !~ '^[a-z][a-z0-9_]{0,63}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_request');
    end if;
  end loop;
  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 336 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_ttl');
  end if;
  if (p_related_type is null) <> (p_related_id is null) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_related');
  end if;
  if not public.passport_subject_type_ok(v_type) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_subject_type');
  end if;

  -- Idempotent create: the same requester + key returns the request it made.
  select * into v_row from public.passport_capture_requests where requested_by = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'id', v_row.id, 'correlation_id', v_row.correlation_id, 'expires_at', v_row.expires_at, 'duplicate', true);
  end if;

  if p_consent_grant_id is null then
    -- Subject-initiated: only the subject's record owner can ask to capture evidence about it.
    if not public.passport_subject_owner_ok(v_type, p_subject_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_authorized');
    end if;
    v_basis := 'subject_initiated'; v_requester_type := v_type; v_requester_id := p_subject_id;
  else
    -- Consent-based: an ACTIVE, capture_request-purposed grant from the subject to an entity the
    -- caller is authorized (data_requester) to act for, covering exactly what is being asked.
    select * into v_grant from public.passport_consent_grants where id = p_consent_grant_id;
    if not found
       or v_grant.status <> 'active' or v_grant.expires_at <= now()
       or v_grant.purpose <> 'capture_request'
       or v_grant.subject_type <> v_type or v_grant.subject_id <> p_subject_id
       or not public.passport_can_request_as(v_grant.grantee_type, v_grant.grantee_id, 'capture_request') then
      return jsonb_build_object('ok', false, 'reason', 'not_authorized');
    end if;
    if not ('evidence_artifacts' = any (v_grant.approved_categories))
       or (p_location_policy = 'optional' and not ('location' = any (v_grant.approved_categories))) then
      return jsonb_build_object('ok', false, 'reason', 'consent_scope_insufficient');
    end if;
    v_basis := 'consent_grant'; v_requester_type := v_grant.grantee_type; v_requester_id := v_grant.grantee_id;
  end if;

  if p_related_type is not null then
    if v_type <> 'person' or not public.passport_capture_related_ok(p_subject_id, p_related_type, p_related_id) then
      return jsonb_build_object('ok', false, 'reason', 'related_not_supported');
    end if;
  end if;
  if (select count(*) from public.passport_capture_requests where subject_type = v_type and subject_id = p_subject_id and status in ('requested', 'accepted', 'started')) >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_open_requests');
  end if;

  insert into public.passport_capture_requests
    (subject_type, subject_id, requester_type, requester_id, requested_by, purpose, evidence_type, related_type, related_id,
     required_metadata, location_policy, operator_identity_policy, consent_basis, consent_grant_id, expires_at, idempotency_key)
  values
    (v_type, p_subject_id, v_requester_type, v_requester_id, auth.uid(), p_purpose, p_evidence_type, p_related_type, p_related_id,
     v_meta, p_location_policy, p_operator_identity_policy, v_basis, p_consent_grant_id, now() + make_interval(hours => p_ttl_hours), p_idempotency_key)
  returning * into v_row;

  perform public._passport_emit_event('capture.requested', 'person', auth.uid()::text, v_type, p_subject_id,
    jsonb_build_object('capture_request_id', v_row.id, 'consent_id', p_consent_grant_id),
    jsonb_build_object('purpose', p_purpose, 'evidence_type', p_evidence_type, 'basis', v_basis), v_row.correlation_id);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'correlation_id', v_row.correlation_id, 'expires_at', v_row.expires_at, 'duplicate', false);
end;
$$;

revoke all on function public.passport_create_capture_request(text, uuid, text, text, text, uuid, text[], text, text, uuid, integer, text) from public, anon;
grant execute on function public.passport_create_capture_request(text, uuid, text, text, text, uuid, text[], text, text, uuid, integer, text) to authenticated;

create or replace function public.passport_cancel_capture_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v public.passport_capture_requests%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v from public.passport_capture_requests where id = p_id for update;
  if not found or not (v.requested_by = auth.uid() or public.passport_subject_owner_ok(v.subject_type, v.subject_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform public._passport_expire_capture(p_id);
  select * into v from public.passport_capture_requests where id = p_id;
  if v.status not in ('requested', 'accepted', 'started') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  update public.passport_capture_requests set status = 'cancelled' where id = p_id;
  perform public._passport_emit_event('capture.cancelled', 'person', auth.uid()::text, v.subject_type, v.subject_id,
    jsonb_build_object('capture_request_id', p_id), '{}'::jsonb, v.correlation_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_cancel_capture_request(uuid) from public, anon;
grant execute on function public.passport_cancel_capture_request(uuid) to authenticated;

create or replace function public.passport_expire_due_capture_requests()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare r record; n integer := 0;
begin
  for r in select id from public.passport_capture_requests where status in ('requested', 'accepted', 'started') and expires_at <= now() loop
    if public._passport_expire_capture(r.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.passport_expire_due_capture_requests() from public, anon;
grant execute on function public.passport_expire_due_capture_requests() to authenticated, service_role;

-- ── G. gateway functions (service_role ONLY) ─────────────────────────────
-- p_client is the authenticated client id the gateway resolved from a verified
-- signature — it is never read from the request body.

create or replace function public.passport_gateway_consume_nonce(p_client text, p_nonce text, p_ttl_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  -- Opportunistic prune of expired nonces (replay-protection state, not audit history).
  delete from public.passport_gateway_nonces where expires_at < now() and ctid in (select ctid from public.passport_gateway_nonces where expires_at < now() limit 500);
  begin
    insert into public.passport_gateway_nonces (client_id, nonce, expires_at) values (p_client, p_nonce, now() + make_interval(secs => greatest(60, least(p_ttl_seconds, 3600))));
  exception when unique_violation then
    return false;
  end;
  return true;
end;
$$;

-- Wire projection of a request (matches @flow/passport-contracts CaptureRequest).
create or replace function public._passport_capture_request_json(v public.passport_capture_requests)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public'
as $$
  select jsonb_build_object(
    'schema_version', '1.0',
    'request_id', v.id,
    'status', v.status,
    'subject', jsonb_build_object('type', v.subject_type, 'id', v.subject_id),
    'requester', jsonb_build_object('type', v.requester_type, 'id', v.requester_id),
    'purpose', v.purpose,
    'evidence_type', v.evidence_type,
    'related', case when v.related_type is null then null else jsonb_build_object('type', v.related_type, 'id', v.related_id) end,
    'required_metadata', to_jsonb(v.required_metadata),
    'location_policy', v.location_policy,
    'operator_identity_policy', v.operator_identity_policy,
    'expires_at', v.expires_at,
    'consent_context', jsonb_build_object('basis', v.consent_basis, 'consent_grant_id', v.consent_grant_id),
    'correlation_id', v.correlation_id,
    'idempotency_key', v.idempotency_key,
    'capture_session_id', v.capture_session_id,
    'created_at', v.created_at,
    'updated_at', v.updated_at
  );
$$;

revoke all on function public._passport_capture_request_json(public.passport_capture_requests) from public, anon, authenticated;

create or replace function public.passport_gateway_get_capture_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v public.passport_capture_requests%rowtype;
begin
  perform public._passport_expire_capture(p_id);
  select * into v from public.passport_capture_requests where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_capture_request');
  end if;
  return jsonb_build_object('ok', true, 'request', public._passport_capture_request_json(v));
end;
$$;

create or replace function public.passport_gateway_report_capture_status(p_client text, p_report jsonb, p_payload_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v public.passport_capture_requests%rowtype;
  v_rcpt public.passport_gateway_receipts%rowtype;
  v_key text := p_report ->> 'idempotency_key';
  v_status text := p_report ->> 'status';
  v_session text := p_report ->> 'capture_session_id';
  v_reason text := p_report ->> 'reason_code';
  v_result jsonb;
begin
  -- Idempotency first: a retry of an already-processed report changes nothing.
  select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'status_report' and idempotency_key = v_key;
  if found then
    if v_rcpt.payload_sha256 <> p_payload_sha256 then
      return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
    end if;
    return v_rcpt.result || jsonb_build_object('duplicate', true);
  end if;

  select * into v from public.passport_capture_requests where id = (p_report ->> 'request_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_capture_request');
  end if;
  if v.status in ('requested', 'accepted', 'started') and v.expires_at <= now() then
    perform public._passport_expire_capture(v.id);
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status = 'expired' then
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status not in ('requested', 'accepted', 'started') then
    return jsonb_build_object('ok', false, 'reason', 'request_not_open');
  end if;
  if v.status <> v_status then
    if not public.passport_capture_transition_allowed(v.status, v_status) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    if v.capture_session_id is not null and v_session is not null and v_session <> v.capture_session_id then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    update public.passport_capture_requests
       set status = v_status,
           capture_session_id = coalesce(capture_session_id, v_session),
           failure_reason = case when v_status = 'failed' then v_reason else failure_reason end
     where id = v.id;
    perform public._passport_emit_event('capture.' || v_status, 'service', p_client, v.subject_type, v.subject_id,
      jsonb_build_object('capture_request_id', v.id),
      jsonb_build_object('reason_code', v_reason), v.correlation_id, p_client);
  end if;

  v_result := jsonb_build_object('ok', true, 'request_id', v.id, 'status', v_status);
  insert into public.passport_gateway_receipts (client_id, kind, idempotency_key, object_key, payload_sha256, result)
  values (p_client, 'status_report', v_key, v.id::text, p_payload_sha256, v_result);
  return v_result || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.passport_gateway_ingest_evidence_package(p_client text, p_package jsonb, p_payload_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v public.passport_capture_requests%rowtype;
  v_rcpt public.passport_gateway_receipts%rowtype;
  v_ev public.passport_evidence%rowtype;
  v_key text := p_package ->> 'idempotency_key';
  v_pkg_id text := p_package ->> 'package_id';
  v_subject_type text := public.passport_canonical_subject_type(p_package -> 'subject' ->> 'type');
  v_subject_id uuid := (p_package -> 'subject' ->> 'id')::uuid;
  v_artifacts jsonb := p_package -> 'artifacts';
  v_meta jsonb := coalesce(p_package -> 'source_metadata', '{}'::jsonb);
  v_required text;
  v_provenance jsonb;
  v_sensitivity text;
  v_result jsonb;
  v_ev_id uuid;
begin
  -- 1. Idempotency: same key + same body = safe retry; same key + different body = conflict.
  select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'evidence_package' and idempotency_key = v_key;
  if found then
    if v_rcpt.payload_sha256 <> p_payload_sha256 then
      return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
    end if;
    return v_rcpt.result || jsonb_build_object('duplicate', true);
  end if;
  -- The same package re-sent under a NEW idempotency key must not create a second record either.
  select * into v_ev from public.passport_evidence where producer = p_client and source_ref = v_pkg_id;
  if found then
    select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'evidence_package' and object_key = v_pkg_id limit 1;
    if found and v_rcpt.payload_sha256 = p_payload_sha256 then
      return v_rcpt.result || jsonb_build_object('duplicate', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
  end if;

  -- 2. The request it answers must exist, be open, and be unexpired.
  select * into v from public.passport_capture_requests where id = (p_package ->> 'capture_request_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_capture_request');
  end if;
  if v.status in ('requested', 'accepted', 'started') and v.expires_at <= now() then
    perform public._passport_expire_capture(v.id);
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status = 'expired' then
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status not in ('requested', 'accepted', 'started') then
    return jsonb_build_object('ok', false, 'reason', 'request_not_open');
  end if;

  -- 3. Evidence about one subject can never answer a request about another.
  if v.subject_type <> v_subject_type or v.subject_id <> v_subject_id then
    return jsonb_build_object('ok', false, 'reason', 'subject_mismatch');
  end if;

  -- 4. Honour the request's data policies.
  if p_package ? 'location' and v.location_policy <> 'optional' then
    return jsonb_build_object('ok', false, 'reason', 'location_not_permitted');
  end if;
  if p_package ? 'operator' and v.operator_identity_policy <> 'optional' then
    return jsonb_build_object('ok', false, 'reason', 'operator_not_permitted');
  end if;
  foreach v_required in array v.required_metadata loop
    if not (v_meta ? v_required) then
      return jsonb_build_object('ok', false, 'reason', 'metadata_missing');
    end if;
  end loop;

  -- 5. Artifacts are Capture-hosted references of the requested kind — never inline data.
  if not public.passport_artifacts_valid(v_artifacts)
     or exists (select 1 from jsonb_array_elements(v_artifacts) a(item)
                where a.item -> 'storage' ->> 'provider' <> 'flow_capture' or a.item ->> 'kind' not in (v.evidence_type, 'other')) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_schema');
  end if;

  v_sensitivity := case when v.purpose = 'credential_document' or p_package ? 'location' then 'sensitive' else 'standard' end;
  v_provenance := jsonb_build_object(
      'capture_session_id', p_package ->> 'capture_session_id',
      'capture_request_id', v.id,
      'producer_version', p_package -> 'provenance' ->> 'producer_version',
      'source_metadata', v_meta)
    || case when p_package -> 'provenance' ? 'capture_method' then jsonb_build_object('capture_method', p_package -> 'provenance' ->> 'capture_method') else '{}'::jsonb end
    || case when p_package -> 'provenance' ? 'device' then jsonb_build_object('device', p_package -> 'provenance' ->> 'device') else '{}'::jsonb end
    || case when p_package ? 'operator' then jsonb_build_object('operator', p_package -> 'operator') else '{}'::jsonb end
    || case when p_package ? 'location' then jsonb_build_object('location', p_package -> 'location') else '{}'::jsonb end;
  if pg_column_size(v_provenance) > 8192 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_schema');
  end if;

  -- 6. Record UNVERIFIED evidence. No claim is created, no verification is recorded.
  insert into public.passport_evidence
    (subject_type, subject_id, evidence_type, source_kind, source_system, source_ref, producer, artifacts,
     captured_at, integrity, provenance, sensitivity, status, capture_request_id)
  values
    (v.subject_type, v.subject_id, v.evidence_type, 'capture', p_client, v_pkg_id, p_client, v_artifacts,
     (p_package ->> 'captured_at')::timestamptz, p_package -> 'integrity', v_provenance, v_sensitivity, 'received', v.id)
  returning id into v_ev_id;

  update public.passport_capture_requests
     set status = 'completed', completed_at = now(), capture_session_id = coalesce(capture_session_id, p_package ->> 'capture_session_id')
   where id = v.id;

  perform public._passport_emit_event('evidence.created', 'service', p_client, v.subject_type, v.subject_id,
    jsonb_build_object('evidence_id', v_ev_id, 'capture_request_id', v.id),
    jsonb_build_object('evidence_type', v.evidence_type, 'source_kind', 'capture', 'package_id', v_pkg_id, 'artifact_count', jsonb_array_length(v_artifacts)),
    v.correlation_id, p_client);
  perform public._passport_emit_event('capture.completed', 'service', p_client, v.subject_type, v.subject_id,
    jsonb_build_object('capture_request_id', v.id, 'evidence_id', v_ev_id), '{}'::jsonb, v.correlation_id, p_client);

  v_result := jsonb_build_object('ok', true, 'evidence_id', v_ev_id, 'package_id', v_pkg_id, 'capture_request_id', v.id, 'received_at', now());
  insert into public.passport_gateway_receipts (client_id, kind, idempotency_key, object_key, payload_sha256, result)
  values (p_client, 'evidence_package', v_key, v_pkg_id, p_payload_sha256, v_result);
  return v_result || jsonb_build_object('duplicate', false);
end;
$$;

-- What the producer may read back about evidence IT delivered: metadata only, never artifact refs.
create or replace function public.passport_gateway_get_evidence_summary(p_client text, p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_ev public.passport_evidence%rowtype; v_rcpt public.passport_gateway_receipts%rowtype;
begin
  select * into v_rcpt from public.passport_gateway_receipts
   where client_id = p_client and kind = 'evidence_package' and (result ->> 'evidence_id')::uuid = p_evidence_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_evidence');
  end if;
  select * into v_ev from public.passport_evidence where id = p_evidence_id;
  return jsonb_build_object('ok', true, 'summary', jsonb_build_object(
    'schema_version', '1.0',
    'evidence_id', v_ev.id,
    'package_id', v_rcpt.object_key,
    'capture_request_id', v_ev.capture_request_id,
    'subject', jsonb_build_object('type', v_ev.subject_type, 'id', v_ev.subject_id),
    'evidence_status', v_ev.status,
    'artifact_count', jsonb_array_length(v_ev.artifacts),
    'captured_at', v_ev.captured_at,
    'received_at', v_ev.created_at));
end;
$$;

-- Connection health. Only AUTHENTICATED gateway calls may reach this, so an
-- unauthenticated caller can never degrade a connection's recorded state.
create or replace function public.passport_gateway_record_connection_result(p_connector text, p_ok boolean, p_error_category text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v public.passport_integration_connections%rowtype;
  v_new text;
  v_created boolean := false;
begin
  if p_error_category is not null and p_error_category not in ('auth', 'network', 'schema', 'rate_limit', 'source_unavailable', 'rejected', 'unknown') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_category');
  end if;
  select * into v from public.passport_integration_connections
   where connector_key = p_connector and owner_type is null and owner_id is null for update;
  if not found then
    insert into public.passport_integration_connections (connector_key, status, scope, last_attempt_at)
    values (p_connector, case when p_ok then 'healthy' else 'error' end,
            array['capture_requests:read', 'capture_requests:report', 'evidence_packages:write', 'evidence:read'], now())
    returning * into v;
    v_created := true;
  end if;

  if p_ok then
    v_new := 'healthy';
    update public.passport_integration_connections
       set status = v_new, last_success_at = now(), last_attempt_at = now(), last_error_category = null
     where id = v.id;
    if v_created or v.status <> 'healthy' then
      perform public._passport_emit_event('integration.connected', 'service', p_connector, null, null,
        jsonb_build_object('connection_id', v.id), jsonb_build_object('connector', p_connector, 'was', case when v_created then null else v.status end), null, p_connector);
    end if;
  else
    v_new := case p_error_category
      when 'auth' then 'auth_required'
      when 'network' then 'degraded' when 'source_unavailable' then 'degraded' when 'rate_limit' then 'degraded'
      else 'error' end;
    update public.passport_integration_connections
       set status = v_new, last_attempt_at = now(), last_error_category = p_error_category
     where id = v.id;
    perform public._passport_emit_event('integration.sync_failed', 'service', p_connector, null, null,
      jsonb_build_object('connection_id', v.id), jsonb_build_object('connector', p_connector, 'category', p_error_category), null, p_connector);
    if v_new is distinct from v.status and not v_created then
      perform public._passport_emit_event(case when v_new in ('auth_required', 'disconnected') then 'integration.disconnected' else 'integration.degraded' end,
        'service', p_connector, null, null,
        jsonb_build_object('connection_id', v.id), jsonb_build_object('connector', p_connector, 'status', v_new), null, p_connector);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', v_new);
end;
$$;

-- Every gateway function is callable by service_role only.
revoke all on function public.passport_gateway_consume_nonce(text, text, integer) from public, anon, authenticated;
revoke all on function public.passport_gateway_get_capture_request(uuid) from public, anon, authenticated;
revoke all on function public.passport_gateway_report_capture_status(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.passport_gateway_ingest_evidence_package(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.passport_gateway_get_evidence_summary(text, uuid) from public, anon, authenticated;
revoke all on function public.passport_gateway_record_connection_result(text, boolean, text) from public, anon, authenticated;
grant execute on function public.passport_gateway_consume_nonce(text, text, integer) to service_role;
grant execute on function public.passport_gateway_get_capture_request(uuid) to service_role;
grant execute on function public.passport_gateway_report_capture_status(text, jsonb, text) to service_role;
grant execute on function public.passport_gateway_ingest_evidence_package(text, jsonb, text) to service_role;
grant execute on function public.passport_gateway_get_evidence_summary(text, uuid) to service_role;
grant execute on function public.passport_gateway_record_connection_result(text, boolean, text) to service_role;
