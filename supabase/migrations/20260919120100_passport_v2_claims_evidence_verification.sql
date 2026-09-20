-- ============================================================
-- Passport V2 core — part 2: claims, evidence, verification
-- ============================================================
--
-- The canonical claim -> evidence -> verification chain. A claim is a
-- structured assertion about a Passport subject; evidence is a first-class
-- reference (never a blob); a verification is a recorded decision by an
-- independent party. Provenance ("why does Passport show this?") is not a
-- separate table — it is the chain
--   subject -> claim -> evidence -> source -> issuer -> method -> verifier -> decision -> time
-- read across these tables (see lib/passport/domain explanation builder).
--
-- Invariants enforced HERE, in the database, in the same transaction that
-- writes the audit event:
--   * AI extraction != verification, evidence != verified claim: a claim
--     becomes `verified` only through passport_record_verification() by a
--     party who is not the subject and who holds the authority the method
--     requires. `self_attested` can never yield `verified`.
--   * Claim status moves only along passport_claim_transition_allowed().
--   * Once a claim leaves `draft`, what it asserts (subject, type, value,
--     issuer) is immutable. Corrections are new claims that supersede, so
--     history is never rewritten.
--   * Verification decisions are immutable once made.
--   * ROLE != AUTHORITY: entity-backed methods need an explicit assignment
--     (passport_has_authority), never a membership role.
--
-- Additive only. Legacy verifications/profile_credentials are untouched.
--
-- Rollback (later migrations depend on these; roll those back first):
--   drop function if exists public.passport_expire_due_claims();
--   drop function if exists public.passport_revoke_claim(uuid, text);
--   drop function if exists public.passport_record_verification(uuid, text, text, timestamptz);
--   drop function if exists public.passport_cancel_verification_request(uuid);
--   drop function if exists public.passport_request_verification(uuid, text, text, uuid);
--   drop function if exists public.passport_detach_evidence(uuid, uuid);
--   drop function if exists public.passport_attach_evidence(uuid, uuid, text);
--   drop function if exists public.passport_add_evidence(text, uuid, text, jsonb, jsonb, text);
--   drop function if exists public.passport_submit_claim(uuid);
--   drop function if exists public.passport_create_claim(text, uuid, text, jsonb, text, text, timestamptz, timestamptz, boolean);
--   drop table if exists public.passport_verifications, public.passport_claim_evidence, public.passport_evidence, public.passport_claims;
--   (then the helper functions: passport_can_act_as_verifier, passport_is_claim_reviewer,
--    passport_is_evidence_reviewer, passport_method_policy, passport_claim_transition_allowed,
--    passport_artifacts_valid, passport_entity_exists, and the guard trigger functions)

-- ── A. policy tables as functions (mirrored in lib/passport/domain) ──────
-- tests/unit/passport-sql-parity.test.ts parses these VALUES lists and fails
-- if they drift from the TypeScript maps.

create or replace function public.passport_claim_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select exists (
    select 1 from (values
      ('draft', 'submitted'),
      ('submitted', 'under_review'), ('submitted', 'verified'), ('submitted', 'rejected'), ('submitted', 'revoked'), ('submitted', 'superseded'),
      ('under_review', 'verified'), ('under_review', 'rejected'), ('under_review', 'revoked'), ('under_review', 'superseded'),
      ('verified', 'expired'), ('verified', 'revoked'), ('verified', 'superseded'), ('verified', 'stale'), ('verified', 'disconnected'),
      ('stale', 'verified'), ('stale', 'expired'), ('stale', 'revoked'), ('stale', 'superseded'), ('stale', 'disconnected'),
      ('disconnected', 'verified'), ('disconnected', 'stale'), ('disconnected', 'expired'), ('disconnected', 'revoked'), ('disconnected', 'superseded'),
      ('rejected', 'superseded'),
      ('expired', 'superseded'),
      ('revoked', 'superseded')
    ) as t(from_status, to_status)
    where t.from_status = p_from and t.to_status = p_to
  );
$$;

create or replace function public.passport_method_policy(p_method text)
returns table (can_yield_verified boolean, independent boolean, required_authority text, platform_admin boolean, available boolean)
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select t.can_yield_verified, t.independent, t.required_authority, t.platform_admin, t.available
  from (values
    ('self_attested', false, false, null::text, false, true),
    ('peer_attested', true, true, null::text, false, true),
    ('employer_verified', true, true, 'evidence_reviewer'::text, false, true),
    ('organization_verified', true, true, 'evidence_reviewer'::text, false, true),
    ('licensed_provider', true, true, 'credential_issuer'::text, false, true),
    ('education_provider', true, true, 'credential_issuer'::text, false, true),
    ('platform_verified', true, true, null::text, true, true),
    ('government_issued', true, true, 'credential_issuer'::text, false, false),
    ('external_source_verified', true, true, 'credential_issuer'::text, false, false)
  ) as t(method, can_yield_verified, independent, required_authority, platform_admin, available)
  where t.method = p_method;
$$;

grant execute on function public.passport_claim_transition_allowed(text, text) to anon, authenticated, service_role;
grant execute on function public.passport_method_policy(text) to authenticated, service_role;

-- Artifact references only — never inline blobs. Shared by the user evidence
-- RPC below and the Capture gateway ingest (a later migration).
create or replace function public.passport_artifacts_valid(p_artifacts jsonb)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  select jsonb_typeof(p_artifacts) = 'array'
    and jsonb_array_length(p_artifacts) <= 50
    and pg_column_size(p_artifacts) <= 65536
    and not exists (
      select 1 from jsonb_array_elements(p_artifacts) as a(item)
      where jsonb_typeof(a.item) <> 'object'
         or coalesce(a.item ->> 'artifact_id', '') !~ '^[A-Za-z0-9._:\-]{1,128}$'
         or coalesce(a.item ->> 'kind', '') not in ('photo', 'video', 'audio', 'document', 'form', 'other')
         or coalesce(a.item ->> 'media_type', '') !~* '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
         or coalesce(a.item -> 'storage' ->> 'provider', '') not in ('flow_capture', 'flow_storage', 'external')
         or coalesce(a.item -> 'storage' ->> 'ref', '') = ''
         or char_length(a.item -> 'storage' ->> 'ref') > 2048
         or (a.item -> 'storage' ->> 'ref') ~* '^\s*data:'
    );
$$;

grant execute on function public.passport_artifacts_valid(jsonb) to authenticated, service_role;

-- Can this (type, id) be a verifier / represented entity today? Only people
-- and organizations have a Flow record to resolve; anything else is refused
-- rather than accepted on faith.
create or replace function public.passport_entity_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select case p_type
    when 'person' then exists (select 1 from public.profiles where id = p_id)
    when 'organization' then exists (select 1 from public.organizations where id = p_id)
    else false
  end;
$$;

revoke all on function public.passport_entity_exists(text, uuid) from public, anon;
grant execute on function public.passport_entity_exists(text, uuid) to authenticated, service_role;

-- ── B. claims ────────────────────────────────────────────────────────────

create table public.passport_claims (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (public.passport_subject_type_ok(subject_type)),
  subject_id uuid not null,
  claim_type text not null check (char_length(claim_type) between 3 and 80 and claim_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  value jsonb not null default '{}'::jsonb check (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 16384),
  issuer_kind text not null default 'subject' check (issuer_kind in ('subject', 'entity', 'external')),
  issuer_type text check (issuer_type is null or public.passport_subject_type_ok(issuer_type)),
  issuer_id uuid,
  issuer_label text check (issuer_label is null or char_length(issuer_label) between 1 and 200),
  source_system text not null default 'flow_platform' check (source_system ~ '^[a-z][a-z0-9_]*(:[a-z0-9_\-]+)?$' and char_length(source_system) <= 64),
  source_ref text check (source_ref is null or source_ref ~ '^[A-Za-z0-9._:\-]{1,128}$'),
  effective_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'verified', 'rejected', 'expired', 'revoked', 'superseded', 'stale', 'disconnected'
  )),
  status_reason_code text check (status_reason_code is null or status_reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  sensitivity text not null default 'standard' check (sensitivity in ('standard', 'sensitive', 'restricted')),
  superseded_by uuid references public.passport_claims(id),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint passport_claims_issuer_shape check (
    (issuer_kind = 'entity' and issuer_type is not null and issuer_id is not null and issuer_label is null)
    or (issuer_kind = 'external' and issuer_type is null and issuer_id is null and issuer_label is not null)
    or (issuer_kind = 'subject' and issuer_type is null and issuer_id is null and issuer_label is null)
  ),
  constraint passport_claims_window check (expires_at is null or effective_at is null or expires_at > effective_at),
  constraint passport_claims_superseded_ref check (
    (status = 'superseded') = (superseded_by is not null) and superseded_by is distinct from id
  )
);

create index passport_claims_subject_idx on public.passport_claims (subject_type, subject_id, status);
create index passport_claims_type_idx on public.passport_claims (claim_type, status);
create index passport_claims_expiry_idx on public.passport_claims (expires_at) where status in ('verified', 'stale', 'disconnected') and expires_at is not null;
create unique index passport_claims_source_unique_idx
  on public.passport_claims (source_system, source_ref, subject_type, subject_id, claim_type)
  where source_ref is not null and status <> 'superseded';

create trigger passport_claims_updated_at before update on public.passport_claims
  for each row execute function public.set_admin_updated_at();

-- Guard: legal transitions only; an asserted claim's substance is frozen.
create or replace function public.passport_claims_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'passport_claims identity columns are immutable' using errcode = 'restrict_violation';
  end if;
  if new.status is distinct from old.status and not public.passport_claim_transition_allowed(old.status, new.status) then
    raise exception 'illegal claim transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- `verified` is only ever reached through a recorded, completed
  -- verification decision. Even a privileged writer (or a future careless
  -- RPC) cannot flip a claim to verified without one: evidence and assertion
  -- are never verification.
  if new.status = 'verified' and old.status <> 'verified' and not exists (
    select 1 from public.passport_verifications v
    where v.claim_id = new.id and v.status = 'completed' and v.decision = 'verified'
  ) then
    raise exception 'a claim cannot become verified without a completed verification decision' using errcode = 'check_violation';
  end if;
  -- After submission the assertion itself never changes; a correction is a
  -- new claim that supersedes this one.
  if old.status <> 'draft' and (
       new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
    or new.claim_type is distinct from old.claim_type or new.value is distinct from old.value
    or new.issuer_kind is distinct from old.issuer_kind or new.issuer_type is distinct from old.issuer_type
    or new.issuer_id is distinct from old.issuer_id or new.issuer_label is distinct from old.issuer_label
    or new.source_system is distinct from old.source_system or new.source_ref is distinct from old.source_ref
  ) then
    raise exception 'a claim is immutable once submitted; supersede it instead' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_claims_guard_trg before update on public.passport_claims
  for each row execute function public.passport_claims_guard();

-- Deleting a claim would erase provenance. Drafts included: withdraw instead.
create or replace function public.passport_no_delete()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  raise exception '% rows are never deleted; change their status instead', tg_table_name using errcode = 'restrict_violation';
end;
$$;

create trigger passport_claims_no_delete before delete on public.passport_claims
  for each row execute function public.passport_no_delete();

-- ── C. evidence ──────────────────────────────────────────────────────────
-- Evidence is a reference + integrity + provenance record. Artifacts are
-- pointers (Capture / storage / external); bytes never live in Passport rows.

create table public.passport_evidence (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (public.passport_subject_type_ok(subject_type)),
  subject_id uuid not null,
  evidence_type text not null check (evidence_type in (
    'document', 'photo', 'video', 'audio', 'form', 'signed_record', 'checkin', 'activity_outcome', 'api_record', 'link', 'note'
  )),
  source_kind text not null check (source_kind in (
    'manual_upload', 'flow_activity', 'event_checkin', 'organization', 'employer', 'capture', 'qr_flow', 'external_source', 'api', 'connector'
  )),
  source_system text not null default 'flow_platform' check (source_system ~ '^[a-z][a-z0-9_]*(:[a-z0-9_\-]+)?$' and char_length(source_system) <= 64),
  source_ref text check (source_ref is null or source_ref ~ '^[A-Za-z0-9._:\-]{1,128}$'),
  producer text not null default 'flow_platform' check (producer ~ '^[a-z][a-z0-9_]{1,63}$'),
  artifacts jsonb not null default '[]'::jsonb check (public.passport_artifacts_valid(artifacts)),
  captured_at timestamptz,
  issued_at timestamptz,
  integrity jsonb check (integrity is null or (jsonb_typeof(integrity) = 'object' and pg_column_size(integrity) <= 1024)),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object' and pg_column_size(provenance) <= 8192),
  sensitivity text not null default 'standard' check (sensitivity in ('standard', 'sensitive', 'restricted')),
  status text not null default 'received' check (status in ('received', 'accepted', 'rejected', 'withdrawn', 'quarantined')),
  capture_request_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index passport_evidence_subject_idx on public.passport_evidence (subject_type, subject_id, created_at desc);
-- Stable external object id: one evidence record per (producer, source_ref).
create unique index passport_evidence_producer_ref_idx on public.passport_evidence (producer, source_ref) where source_ref is not null;
create index passport_evidence_capture_request_idx on public.passport_evidence (capture_request_id) where capture_request_id is not null;

create trigger passport_evidence_no_delete before delete on public.passport_evidence
  for each row execute function public.passport_no_delete();

-- What the evidence IS never changes; only its status can (accepted/
-- rejected/withdrawn/quarantined).
create or replace function public.passport_evidence_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if new.id is distinct from old.id or new.subject_type is distinct from old.subject_type or new.subject_id is distinct from old.subject_id
     or new.evidence_type is distinct from old.evidence_type or new.source_kind is distinct from old.source_kind
     or new.source_system is distinct from old.source_system or new.source_ref is distinct from old.source_ref
     or new.producer is distinct from old.producer or new.artifacts is distinct from old.artifacts
     or new.integrity is distinct from old.integrity or new.provenance is distinct from old.provenance
     or new.captured_at is distinct from old.captured_at or new.created_at is distinct from old.created_at then
    raise exception 'passport_evidence content is immutable; only status may change' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_evidence_guard_trg before update on public.passport_evidence
  for each row execute function public.passport_evidence_guard();

create table public.passport_claim_evidence (
  claim_id uuid not null references public.passport_claims(id),
  evidence_id uuid not null references public.passport_evidence(id),
  role text not null default 'supports' check (role in ('supports', 'context', 'contradicts')),
  attached_by uuid references public.profiles(id) on delete set null,
  attached_at timestamptz not null default now(),
  detached_at timestamptz,
  primary key (claim_id, evidence_id)
);

create index passport_claim_evidence_evidence_idx on public.passport_claim_evidence (evidence_id);

-- ── D. verification records ──────────────────────────────────────────────

create table public.passport_verifications (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.passport_claims(id),
  method text not null check (method in (
    'self_attested', 'peer_attested', 'employer_verified', 'organization_verified', 'licensed_provider',
    'education_provider', 'platform_verified', 'government_issued', 'external_source_verified'
  )),
  verifier_type text not null check (verifier_type in ('person', 'organization', 'agency', 'program', 'system')),
  verifier_id uuid,
  status text not null default 'requested' check (status in ('requested', 'completed', 'cancelled')),
  decision text check (decision is null or decision in ('verified', 'rejected', 'revoked')),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  expires_at timestamptz,
  revocation_context jsonb check (revocation_context is null or (jsonb_typeof(revocation_context) = 'object' and pg_column_size(revocation_context) <= 2048)),
  constraint passport_verifications_verifier_shape check ((verifier_type = 'system') = (verifier_id is null)),
  constraint passport_verifications_decision_shape check ((status = 'completed') = (decision is not null)),
  constraint passport_verifications_decided_shape check ((decision is null) = (decided_at is null))
);

create index passport_verifications_claim_idx on public.passport_verifications (claim_id, requested_at desc);
create index passport_verifications_verifier_idx on public.passport_verifications (verifier_type, verifier_id) where status = 'requested';
create unique index passport_verifications_one_open_idx
  on public.passport_verifications (claim_id, method, verifier_type, coalesce(verifier_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'requested';

create trigger passport_verifications_no_delete before delete on public.passport_verifications
  for each row execute function public.passport_no_delete();

-- A decision, once made, is history. Only a pending request may change
-- (to completed or cancelled).
create or replace function public.passport_verifications_guard()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $$
begin
  if old.status <> 'requested' then
    raise exception 'a completed or cancelled verification is immutable' using errcode = 'restrict_violation';
  end if;
  if new.claim_id is distinct from old.claim_id or new.method is distinct from old.method
     or new.verifier_type is distinct from old.verifier_type or new.verifier_id is distinct from old.verifier_id
     or new.requested_at is distinct from old.requested_at or new.requested_by is distinct from old.requested_by then
    raise exception 'verification request identity is immutable' using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger passport_verifications_guard_trg before update on public.passport_verifications
  for each row execute function public.passport_verifications_guard();

-- ── E. authorization helpers (SECURITY DEFINER to avoid RLS recursion) ───

-- May the CALLER decide a verification of this method by this verifier ref,
-- for a claim of this type? Entity-backed methods need an explicit authority
-- assignment on the verifying entity — never a membership role.
create or replace function public.passport_can_act_as_verifier(p_verifier_type text, p_verifier_id uuid, p_method text, p_claim_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_policy record;
begin
  if auth.uid() is null then return false; end if;
  select * into v_policy from public.passport_method_policy(p_method);
  if not found or not v_policy.available or not v_policy.can_yield_verified then return false; end if;
  if v_policy.platform_admin then
    return p_verifier_type = 'system' and public.is_flow_admin(true);
  end if;
  if p_method = 'peer_attested' then
    return p_verifier_type = 'person' and p_verifier_id = auth.uid();
  end if;
  if v_policy.required_authority is not null then
    return p_verifier_type = 'organization'
      and public.passport_has_authority(p_verifier_type, p_verifier_id, v_policy.required_authority, null, p_claim_type);
  end if;
  return false;
end;
$$;

revoke all on function public.passport_can_act_as_verifier(text, uuid, text, text) from public, anon;
grant execute on function public.passport_can_act_as_verifier(text, uuid, text, text) to authenticated, service_role;

-- Is the caller a party who has been asked to decide on this claim?
create or replace function public.passport_is_claim_reviewer(p_claim_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1
    from public.passport_verifications v
    join public.passport_claims c on c.id = v.claim_id
    where v.claim_id = p_claim_id and v.status = 'requested'
      and public.passport_can_act_as_verifier(v.verifier_type, v.verifier_id, v.method, c.claim_type)
  );
$$;

-- anon: referenced by the public-read claims policy (parse-time EXECUTE check);
-- returns false for anon because passport_can_act_as_verifier requires auth.uid().
revoke all on function public.passport_is_claim_reviewer(uuid) from public;
grant execute on function public.passport_is_claim_reviewer(uuid) to anon, authenticated, service_role;

-- Reviewers can see the evidence attached to the claim they were asked to
-- decide — and only that.
create or replace function public.passport_is_evidence_reviewer(p_evidence_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.passport_claim_evidence ce
    where ce.evidence_id = p_evidence_id and ce.detached_at is null
      and public.passport_is_claim_reviewer(ce.claim_id)
  );
$$;

revoke all on function public.passport_is_evidence_reviewer(uuid) from public, anon;
grant execute on function public.passport_is_evidence_reviewer(uuid) to authenticated, service_role;

-- ── F. RLS ───────────────────────────────────────────────────────────────

alter table public.passport_claims enable row level security;
alter table public.passport_evidence enable row level security;
alter table public.passport_claim_evidence enable row level security;
alter table public.passport_verifications enable row level security;

revoke all on table public.passport_claims, public.passport_evidence, public.passport_claim_evidence, public.passport_verifications
  from public, anon, authenticated;
grant select on table public.passport_claims to anon, authenticated;
grant select on table public.passport_evidence, public.passport_claim_evidence, public.passport_verifications to authenticated;
grant select on table public.passport_claims, public.passport_evidence, public.passport_claim_evidence, public.passport_verifications to service_role;

-- Claims: the owner sees everything of theirs; the world sees only claims the
-- subject explicitly made public AND that are currently verified, for a
-- subject that allows public display; a party asked to verify a claim sees it;
-- an AAL2 admin can audit. Everything else — drafts, rejected claims,
-- private claims — is invisible to everyone else.
create policy passport_claims_read on public.passport_claims for select to anon, authenticated
  using (
    public.passport_subject_owner_ok(subject_type, subject_id)
    or (visibility = 'public' and status = 'verified' and (expires_at is null or expires_at > now())
        and public.passport_subject_is_public(subject_type, subject_id))
    or public.passport_is_claim_reviewer(id)
    or public.is_flow_admin(true)
  );

-- Evidence is never public. Owner, an asked reviewer (for evidence attached to
-- the claim under review), or an AAL2 admin.
create policy passport_evidence_read on public.passport_evidence for select to authenticated
  using (
    public.passport_subject_owner_ok(subject_type, subject_id)
    or public.passport_is_evidence_reviewer(id)
    or public.is_flow_admin(true)
  );

create policy passport_claim_evidence_read on public.passport_claim_evidence for select to authenticated
  using (
    exists (select 1 from public.passport_claims c where c.id = claim_id and public.passport_subject_owner_ok(c.subject_type, c.subject_id))
    or public.passport_is_claim_reviewer(claim_id)
    or public.is_flow_admin(true)
  );

create policy passport_verifications_read on public.passport_verifications for select to authenticated
  using (
    exists (select 1 from public.passport_claims c where c.id = claim_id and public.passport_subject_owner_ok(c.subject_type, c.subject_id))
    or public.passport_can_act_as_verifier(verifier_type, verifier_id, method,
         (select c.claim_type from public.passport_claims c where c.id = claim_id))
    or public.is_flow_admin(true)
  );

-- ── G. RPCs ──────────────────────────────────────────────────────────────

create or replace function public.passport_create_claim(
  p_subject_type text,
  p_subject_id uuid,
  p_claim_type text,
  p_value jsonb default '{}'::jsonb,
  p_visibility text default 'private',
  p_sensitivity text default 'standard',
  p_effective_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_submit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_type text := public.passport_canonical_subject_type(p_subject_type);
  v_id uuid;
  v_status text := case when p_submit then 'submitted' else 'draft' end;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.passport_subject_type_ok(v_type) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_subject_type');
  end if;
  if not public.passport_subject_owner_ok(v_type, p_subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if p_claim_type is null or char_length(p_claim_type) not between 3 and 80 or p_claim_type !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_claim_type');
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' or pg_column_size(p_value) > 16384 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_value');
  end if;
  if p_visibility not in ('private', 'public') or p_sensitivity not in ('standard', 'sensitive', 'restricted') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_disclosure');
  end if;
  -- A sensitive/restricted claim can never be made public.
  if p_visibility = 'public' and p_sensitivity <> 'standard' then
    return jsonb_build_object('ok', false, 'reason', 'sensitive_cannot_be_public');
  end if;
  if p_expires_at is not null and p_effective_at is not null and p_expires_at <= p_effective_at then
    return jsonb_build_object('ok', false, 'reason', 'invalid_window');
  end if;

  -- A user-created claim is always a self-assertion from source 'manual'.
  insert into public.passport_claims
    (subject_type, subject_id, claim_type, value, issuer_kind, source_system, effective_at, expires_at, status, visibility, sensitivity, created_by)
  values
    (v_type, p_subject_id, p_claim_type, p_value, 'subject', 'manual', p_effective_at, p_expires_at, v_status, p_visibility, p_sensitivity, auth.uid())
  returning id into v_id;

  perform public._passport_emit_event('claim.created', 'person', auth.uid()::text, v_type, p_subject_id,
    jsonb_build_object('claim_id', v_id), jsonb_build_object('claim_type', p_claim_type, 'status', v_status));
  if p_submit then
    perform public._passport_emit_event('claim.submitted', 'person', auth.uid()::text, v_type, p_subject_id,
      jsonb_build_object('claim_id', v_id), jsonb_build_object('claim_type', p_claim_type));
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.passport_create_claim(text, uuid, text, jsonb, text, text, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.passport_create_claim(text, uuid, text, jsonb, text, text, timestamptz, timestamptz, boolean) to authenticated;

create or replace function public.passport_submit_claim(p_claim_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_claim public.passport_claims%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found or not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    -- Same answer for "doesn't exist" and "not yours": no existence oracle.
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_claim.status <> 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_a_draft');
  end if;
  update public.passport_claims set status = 'submitted' where id = p_claim_id;
  perform public._passport_emit_event('claim.submitted', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', p_claim_id), jsonb_build_object('claim_type', v_claim.claim_type));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_submit_claim(uuid) from public, anon;
grant execute on function public.passport_submit_claim(uuid) to authenticated;

-- User-supplied evidence. Only what a person can honestly supply themselves:
-- documents/photos/etc. as REFERENCES, source_kind 'manual_upload'. The
-- system-derived kinds (checkin, activity_outcome, capture, ...) are written
-- only by trusted server paths.
create or replace function public.passport_add_evidence(
  p_subject_type text,
  p_subject_id uuid,
  p_evidence_type text,
  p_artifacts jsonb,
  p_provenance jsonb default '{}'::jsonb,
  p_sensitivity text default 'standard'
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_type text := public.passport_canonical_subject_type(p_subject_type);
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.passport_subject_type_ok(v_type) or not public.passport_subject_owner_ok(v_type, p_subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if p_evidence_type not in ('document', 'photo', 'video', 'audio', 'form', 'link', 'note') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_evidence_type');
  end if;
  if not public.passport_artifacts_valid(coalesce(p_artifacts, '[]'::jsonb)) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_artifacts');
  end if;
  -- A user-supplied artifact can only point at Flow storage or an external
  -- link. 'flow_capture' refs are reserved for the authenticated gateway.
  if exists (select 1 from jsonb_array_elements(coalesce(p_artifacts, '[]'::jsonb)) a(item) where a.item -> 'storage' ->> 'provider' = 'flow_capture') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_artifacts');
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance) <> 'object' or pg_column_size(p_provenance) > 8192 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_provenance');
  end if;
  if p_sensitivity not in ('standard', 'sensitive', 'restricted') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_disclosure');
  end if;

  insert into public.passport_evidence (subject_type, subject_id, evidence_type, source_kind, source_system, producer, artifacts, provenance, sensitivity, created_by)
  values (v_type, p_subject_id, p_evidence_type, 'manual_upload', 'manual', 'flow_platform', coalesce(p_artifacts, '[]'::jsonb), p_provenance, p_sensitivity, auth.uid())
  returning id into v_id;

  perform public._passport_emit_event('evidence.created', 'person', auth.uid()::text, v_type, p_subject_id,
    jsonb_build_object('evidence_id', v_id), jsonb_build_object('evidence_type', p_evidence_type, 'source_kind', 'manual_upload'));
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.passport_add_evidence(text, uuid, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.passport_add_evidence(text, uuid, text, jsonb, jsonb, text) to authenticated;

create or replace function public.passport_attach_evidence(p_claim_id uuid, p_evidence_id uuid, p_role text default 'supports')
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_claim public.passport_claims%rowtype; v_ev public.passport_evidence%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found or not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_ev from public.passport_evidence where id = p_evidence_id;
  if not found or not public.passport_subject_owner_ok(v_ev.subject_type, v_ev.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  -- Evidence about one subject can never support a claim about another.
  if v_ev.subject_type <> v_claim.subject_type or v_ev.subject_id <> v_claim.subject_id then
    return jsonb_build_object('ok', false, 'reason', 'subject_mismatch');
  end if;
  if p_role not in ('supports', 'context', 'contradicts') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  if v_claim.status not in ('draft', 'submitted', 'under_review') then
    return jsonb_build_object('ok', false, 'reason', 'claim_not_open');
  end if;
  if v_ev.status in ('rejected', 'withdrawn', 'quarantined') then
    return jsonb_build_object('ok', false, 'reason', 'evidence_unusable');
  end if;

  insert into public.passport_claim_evidence (claim_id, evidence_id, role, attached_by)
  values (p_claim_id, p_evidence_id, p_role, auth.uid())
  on conflict (claim_id, evidence_id) do update set role = excluded.role, detached_at = null, attached_by = excluded.attached_by, attached_at = now()
    where public.passport_claim_evidence.detached_at is not null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_attached');
  end if;

  perform public._passport_emit_event('evidence.attached', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', p_claim_id, 'evidence_id', p_evidence_id), jsonb_build_object('role', p_role));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_attach_evidence(uuid, uuid, text) from public, anon;
grant execute on function public.passport_attach_evidence(uuid, uuid, text) to authenticated;

-- Detach is soft (detached_at) and only while the claim is still a draft or
-- merely submitted — once a verifier is looking at it, evidence can't be
-- pulled out from under them.
create or replace function public.passport_detach_evidence(p_claim_id uuid, p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_claim public.passport_claims%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found or not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_claim.status not in ('draft', 'submitted') then
    return jsonb_build_object('ok', false, 'reason', 'claim_not_editable');
  end if;
  update public.passport_claim_evidence set detached_at = now()
   where claim_id = p_claim_id and evidence_id = p_evidence_id and detached_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_attached');
  end if;
  perform public._passport_emit_event('evidence.removed', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', p_claim_id, 'evidence_id', p_evidence_id), '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_detach_evidence(uuid, uuid) from public, anon;
grant execute on function public.passport_detach_evidence(uuid, uuid) to authenticated;

-- The subject asks a specific party to verify a specific claim.
create or replace function public.passport_request_verification(p_claim_id uuid, p_method text, p_verifier_type text, p_verifier_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_claim public.passport_claims%rowtype;
  v_policy record;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found or not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_claim.status not in ('submitted', 'under_review') then
    return jsonb_build_object('ok', false, 'reason', 'claim_not_reviewable');
  end if;

  select * into v_policy from public.passport_method_policy(p_method);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_method');
  end if;
  if not v_policy.available then
    return jsonb_build_object('ok', false, 'reason', 'method_not_available');
  end if;
  if not v_policy.can_yield_verified then
    return jsonb_build_object('ok', false, 'reason', 'method_cannot_verify');
  end if;

  -- Shape of the verifier ref per method.
  if v_policy.platform_admin then
    if p_verifier_type <> 'system' or p_verifier_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_verifier');
    end if;
  elsif p_method = 'peer_attested' then
    if p_verifier_type <> 'person' or p_verifier_id is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_verifier');
    end if;
  else
    if p_verifier_type <> 'organization' or p_verifier_id is null then
      return jsonb_build_object('ok', false, 'reason', 'invalid_verifier');
    end if;
  end if;
  if p_verifier_type <> 'system' then
    if not public.passport_entity_exists(p_verifier_type, p_verifier_id) then
      return jsonb_build_object('ok', false, 'reason', 'verifier_not_found');
    end if;
    -- Independence: nobody verifies themselves, and an organization can't
    -- verify a claim about itself.
    if p_verifier_type = v_claim.subject_type and p_verifier_id = v_claim.subject_id then
      return jsonb_build_object('ok', false, 'reason', 'verifier_is_subject');
    end if;
  end if;

  begin
    insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, requested_by)
    values (p_claim_id, p_method, p_verifier_type, p_verifier_id, auth.uid())
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_requested');
  end;

  if v_claim.status = 'submitted' then
    update public.passport_claims set status = 'under_review' where id = p_claim_id;
    perform public._passport_emit_event('claim.under_review', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
      jsonb_build_object('claim_id', p_claim_id, 'verification_id', v_id), '{}'::jsonb);
  end if;
  perform public._passport_emit_event('verification.requested', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', p_claim_id, 'verification_id', v_id),
    jsonb_build_object('method', p_method, 'verifier_type', p_verifier_type, 'verifier_id', p_verifier_id));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.passport_request_verification(uuid, text, text, uuid) from public, anon;
grant execute on function public.passport_request_verification(uuid, text, text, uuid) to authenticated;

create or replace function public.passport_cancel_verification_request(p_verification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_ver public.passport_verifications%rowtype; v_claim public.passport_claims%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  select * into v_ver from public.passport_verifications where id = p_verification_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into v_claim from public.passport_claims where id = v_ver.claim_id;
  if not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_ver.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  update public.passport_verifications set status = 'cancelled' where id = p_verification_id;
  perform public._passport_emit_event('verification.completed', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', v_ver.claim_id, 'verification_id', p_verification_id), jsonb_build_object('outcome', 'cancelled'));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_cancel_verification_request(uuid) from public, anon;
grant execute on function public.passport_cancel_verification_request(uuid) to authenticated;

-- The decision. Authorization is entirely row-scoped and method-scoped: the
-- caller must be the party the request named (peer), or hold the authority the
-- method requires on the verifying entity, or be an AAL2 admin for
-- platform_verified. Not the subject, ever.
create or replace function public.passport_record_verification(
  p_verification_id uuid,
  p_decision text,
  p_reason_code text default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_ver public.passport_verifications%rowtype;
  v_claim public.passport_claims%rowtype;
  v_new_status text;
  v_expires timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_decision not in ('verified', 'rejected') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_decision');
  end if;
  if p_reason_code is not null and p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason_code');
  end if;
  if p_decision = 'rejected' and p_reason_code is null then
    return jsonb_build_object('ok', false, 'reason', 'reason_code_required');
  end if;

  select * into v_ver from public.passport_verifications where id = p_verification_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select * into v_claim from public.passport_claims where id = v_ver.claim_id for update;

  -- The subject can never decide their own claim, under any method.
  if public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'self_verification_not_allowed');
  end if;
  if not public.passport_can_act_as_verifier(v_ver.verifier_type, v_ver.verifier_id, v_ver.method, v_claim.claim_type) then
    -- Indistinguishable from "no such request" to a caller who isn't the party.
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;
  if v_ver.status <> 'requested' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;
  if v_claim.status not in ('submitted', 'under_review') then
    return jsonb_build_object('ok', false, 'reason', 'claim_not_reviewable');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expiry_not_in_future');
  end if;

  v_new_status := case p_decision when 'verified' then 'verified' else 'rejected' end;
  v_expires := case
    when p_decision <> 'verified' then v_claim.expires_at
    when p_expires_at is null then v_claim.expires_at
    when v_claim.expires_at is null then p_expires_at
    else least(v_claim.expires_at, p_expires_at)
  end;

  update public.passport_verifications
     set status = 'completed', decision = p_decision, reason_code = p_reason_code,
         decided_by = auth.uid(), decided_at = now(), expires_at = v_expires
   where id = p_verification_id;

  update public.passport_claims
     set status = v_new_status,
         status_reason_code = case when p_decision = 'rejected' then p_reason_code else null end,
         effective_at = case when p_decision = 'verified' then coalesce(effective_at, now()) else effective_at end,
         expires_at = v_expires
   where id = v_claim.id;

  -- Other pending requests on this claim are moot once it is decided.
  update public.passport_verifications set status = 'cancelled'
   where claim_id = v_claim.id and status = 'requested' and id <> p_verification_id;

  perform public._passport_emit_event('verification.completed', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', v_claim.id, 'verification_id', p_verification_id),
    jsonb_build_object('method', v_ver.method, 'decision', p_decision, 'reason_code', p_reason_code));
  perform public._passport_emit_event(case p_decision when 'verified' then 'claim.verified' else 'claim.rejected' end,
    'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', v_claim.id, 'verification_id', p_verification_id),
    jsonb_build_object('method', v_ver.method, 'reason_code', p_reason_code));

  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

revoke all on function public.passport_record_verification(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.passport_record_verification(uuid, text, text, timestamptz) to authenticated;

-- Withdraw / revoke a claim. The subject may withdraw their own; the party that
-- verified it (same authority) or an AAL2 admin may revoke it. Verifier/admin
-- revocations are recorded as a verification decision with context; a
-- subject's own withdrawal is not a verification and only leaves the event.
create or replace function public.passport_revoke_claim(p_claim_id uuid, p_reason_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_claim public.passport_claims%rowtype;
  v_last public.passport_verifications%rowtype;
  v_is_subject boolean;
  v_is_verifier boolean := false;
  v_is_admin boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_reason_code is null or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    return jsonb_build_object('ok', false, 'reason', 'reason_code_required');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_is_subject := public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id);
  select * into v_last from public.passport_verifications
   where claim_id = p_claim_id and status = 'completed' and decision = 'verified'
   order by decided_at desc limit 1;
  if found then
    v_is_verifier := public.passport_can_act_as_verifier(v_last.verifier_type, v_last.verifier_id, v_last.method, v_claim.claim_type);
  end if;
  v_is_admin := public.is_flow_admin(true);

  if not (v_is_subject or v_is_verifier or v_is_admin) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.passport_claim_transition_allowed(v_claim.status, 'revoked') then
    return jsonb_build_object('ok', false, 'reason', 'not_revocable');
  end if;

  update public.passport_claims set status = 'revoked', status_reason_code = p_reason_code where id = p_claim_id;
  update public.passport_verifications set status = 'cancelled' where claim_id = p_claim_id and status = 'requested';

  if not v_is_subject and v_last.id is not null then
    insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, reason_code, requested_by, decided_by, decided_at, revocation_context)
    values (p_claim_id, v_last.method, v_last.verifier_type, v_last.verifier_id, 'completed', 'revoked', p_reason_code, auth.uid(), auth.uid(), now(),
            jsonb_build_object('revokes_verification_id', v_last.id, 'by', case when v_is_admin then 'admin' else 'verifier' end));
  end if;

  perform public._passport_emit_event('claim.revoked', 'person', auth.uid()::text, v_claim.subject_type, v_claim.subject_id,
    jsonb_build_object('claim_id', p_claim_id),
    jsonb_build_object('reason_code', p_reason_code, 'by', case when v_is_subject then 'subject' when v_is_verifier then 'verifier' else 'admin' end));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_revoke_claim(uuid, text) from public, anon;
grant execute on function public.passport_revoke_claim(uuid, text) to authenticated;

-- Time-based expiry, materialised. Reads already treat an overdue claim as
-- expired; this makes the status (and the audit event) durable. No scheduler
-- is configured yet — it is safe to call from anywhere, any time, and is
-- invoked opportunistically by the data layer.
create or replace function public.passport_expire_due_claims()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare r record; n integer := 0;
begin
  for r in
    update public.passport_claims set status = 'expired', status_reason_code = 'window_closed'
     where status in ('verified', 'stale', 'disconnected') and expires_at is not null and expires_at <= now()
    returning id, subject_type, subject_id, claim_type
  loop
    perform public._passport_emit_event('claim.expired', 'system', 'passport', r.subject_type, r.subject_id,
      jsonb_build_object('claim_id', r.id), jsonb_build_object('claim_type', r.claim_type));
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.passport_expire_due_claims() from public, anon;
grant execute on function public.passport_expire_due_claims() to authenticated, service_role;
