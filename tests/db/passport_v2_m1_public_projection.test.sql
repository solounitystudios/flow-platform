-- Passport V2 — M1 regression matrix: ANONYMOUS / RAW CLAIM EXPOSURE.
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)
--
-- THE FINDING. `anon` could read raw public claim rows straight from passport_claims — source_ref, issuer_id,
-- created_by, the whole `value` — i.e. columns the explanation RPC deliberately hides from the public. RLS is row-level:
-- it can never hide a column, so a row that is "visible to the world" hands out every column.
--
-- THE INVARIANT. PUBLIC PASSPORT != RAW PASSPORT RECORD. Anonymous/public consumers receive only the minimum canonical
-- public projection, built from an ALLOW-list (default deny), never a filtered copy of the row; unauthorised signed-in
-- users receive no more than anon; selective disclosure is judged at the point of use.
--
-- METHOD. The fixture plants a unique CANARY string in EVERY column an attacker might hope to reach — every claim column,
-- unlisted `value` keys, evidence artifacts/provenance/integrity, verification reason/revocation context, consent and
-- relationship rows — and each case then proves the canary does not appear in ANY public output. A canary is stronger
-- than a key-name check: it catches a leak under a different name, or nested deeper. Every denial has a POSITIVE CONTROL.
--
-- Matrix (cases are functions m1."M1-nn"; the runner executes ALL and reports every failure, not just the first):
--   M1-01 anon public Passport = exactly the allow-list          M1-09  owner/private view keeps legitimate private data
--   M1-02 anon cannot query raw claim records directly           M1-10  selective disclosure = only authorised answers
--   M1-03 no evidence payloads                                   M1-11  revoked disclosure disappears immediately
--   M1-04 no internal provenance                                 M1-12  expired disclosure disappears
--   M1-05 no private metadata                                    M1-13  unauthorised signed-in user gets no more than anon
--   M1-06 no consent internals                                   M1-14  admin/verifier internals stay behind authorization
--   M1-07 no internal relationship identifiers                   M1-15  no alternate endpoint / RPC / view reproduces the raw exposure
--   M1-08 the projection does not grow when the schema does

-- Defer SQL-function body validation so this file also LOADS against a pre-fix schema (where passport_public_claims() does not
-- exist yet) and the runner can report every failing case instead of dying at the first helper.
set local check_function_bodies = off;

create schema m1;
grant usage on schema m1 to public;
create table passport_test.m1_results (id text primary key, ok boolean not null, detail text);
grant all on passport_test.m1_results to public;

-- ── fixture ────────────────────────────────────────────────────────────────────────────────────────────────
-- P subject (public Passport) · H host of the activity P completed · X stranger · Y independent peer verifier
-- ADM platform admin · G grantee-org owner (selective disclosure) · REV reviewer asked to decide one of P's claims
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'm1-p@test.local'),   ('a1000000-0000-4000-8000-000000000002', 'm1-h@test.local'),
  ('a1000000-0000-4000-8000-000000000003', 'm1-x@test.local'),   ('a1000000-0000-4000-8000-000000000004', 'm1-y@test.local'),
  ('a1000000-0000-4000-8000-000000000005', 'm1-adm@test.local'), ('a1000000-0000-4000-8000-000000000006', 'm1-g@test.local'),
  ('a1000000-0000-4000-8000-000000000007', 'm1-rev@test.local');
insert into public.admins (profile_id, role, active) values ('a1000000-0000-4000-8000-000000000005', 'admin', true);
update public.profiles set public_passport = true where id = 'a1000000-0000-4000-8000-000000000001';

-- CANARY_ strings: unmistakable, unique per column. If ANY of them appears in a public output, that column leaked.
-- (1) A genuine, platform-derived, PUBLIC, VERIFIED participation claim — the ONLY kind the public projection may headline —
--     with a canary in every column and in unlisted value keys.
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, issuer_kind, issuer_label, source_system, source_ref, status, visibility, sensitivity, effective_at, created_by)
values ('c4000000-0000-4000-8000-000000000001', 'person', 'a1000000-0000-4000-8000-000000000001', 'participation.activity',
        jsonb_build_object('title', 'Welding workshop', 'activity_type', 'workshop',
                           'private_note', 'CANARY_VALUE_PRIVATE_NOTE', 'contact_email', 'CANARY_VALUE_EMAIL', 'internal', jsonb_build_object('debug', 'CANARY_VALUE_NESTED'),
                           'activity_id', 'CANARY_VALUE_ACTIVITY_ID', 'host_id', 'CANARY_VALUE_HOST_ID'),
        'external', 'CANARY_ISSUER_LABEL', 'flow_platform', 'CANARY_SOURCE_REF', 'submitted', 'public', 'standard', now() - interval '2 days',
        'a1000000-0000-4000-8000-000000000002');
insert into public.passport_evidence (id, subject_type, subject_id, evidence_type, source_kind, source_system, source_ref, producer, artifacts, captured_at, integrity, provenance, sensitivity, status, created_by)
values ('e4000000-0000-4000-8000-000000000001', 'person', 'a1000000-0000-4000-8000-000000000001', 'document', 'manual_upload', 'flow_platform', 'CANARY_EVIDENCE_SOURCE_REF', 'flow_web',
        '[{"artifact_id":"CANARY_EVIDENCE_ARTIFACT_ID","kind":"document","media_type":"application/pdf","storage":{"provider":"flow_storage","ref":"CANARY_EVIDENCE_STORAGE_PATH"}}]'::jsonb, now() - interval '3 days', '{"sha256":"CANARY_EVIDENCE_HASH"}'::jsonb, '{"captured_by":"CANARY_EVIDENCE_PROVENANCE"}'::jsonb,
        'sensitive', 'accepted', 'a1000000-0000-4000-8000-000000000001');
insert into public.passport_claim_evidence (claim_id, evidence_id, role, attached_by) values ('c4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 'supports', 'a1000000-0000-4000-8000-000000000001');
-- a completed, INDEPENDENT decision on record (peer Y), then the now-legal flip to verified; canary in the decision's reason + revocation context
insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, reason_code, decided_at, decided_by, requested_by, revocation_context)
values ('c4000000-0000-4000-8000-000000000001', 'peer_attested', 'person', 'a1000000-0000-4000-8000-000000000004', 'completed', 'verified', 'canary_verification_reason', now(), 'a1000000-0000-4000-8000-000000000004',
        'a1000000-0000-4000-8000-000000000001', '{"note":"CANARY_REVOCATION_CONTEXT"}'::jsonb);
update public.passport_claims set status = 'verified', status_reason_code = 'canary_status_reason' where id = 'c4000000-0000-4000-8000-000000000001';

-- (2) Claims the projection must NOT headline, each otherwise "public + verified": a MEMBER-created claim (source manual), a sensitive one, an expired one
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, issuer_kind, source_system, status, visibility, sensitivity, effective_at, created_by)
values ('c4000000-0000-4000-8000-000000000002', 'person', 'a1000000-0000-4000-8000-000000000001', 'participation.activity', '{"title":"CANARY_MANUAL_CLAIM_TITLE","activity_type":"workshop"}', 'subject', 'manual', 'submitted', 'public', 'standard', now(), 'a1000000-0000-4000-8000-000000000001'),
       ('c4000000-0000-4000-8000-000000000003', 'person', 'a1000000-0000-4000-8000-000000000001', 'credential.identity', '{"id_number":"CANARY_SENSITIVE_ID_NUMBER"}', 'subject', 'flow_platform', 'submitted', 'public', 'sensitive', now(), 'a1000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by, requested_by)
select c, 'peer_attested', 'person', 'a1000000-0000-4000-8000-000000000004', 'completed', 'verified', now(), 'a1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001'
  from unnest(array['c4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000003']::uuid[]) c;
update public.passport_claims set status = 'verified' where id in ('c4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000003');

-- (3) consent + relationship rows about P (canary in the free-text columns) — the public must never see either table
select set_config('flow.internal_write', 'true', true);
insert into public.organizations (id, owner_id, name, verified) values ('b4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', 'M1 Grantee Org', true);
insert into public.organizations (id, owner_id, name, verified) values ('b4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000006', 'M1 Grantee Org 2', false);
update public.organizations set verified = true where id = 'b4000000-0000-4000-8000-000000000002';
select set_config('flow.internal_write', '', true);
do $f$ begin
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');   -- the org owner deliberately assigns THEMSELVES the data_requester authority (audited)
  perform passport_test.ok(public.passport_assign_authority('a1000000-0000-4000-8000-000000000006', 'organization', 'b4000000-0000-4000-8000-000000000001', 'data_requester', array['hiring_review'], '{}', now() + interval '30 days'), 'fixture: data_requester on grantee org 1');
  perform passport_test.ok(public.passport_assign_authority('a1000000-0000-4000-8000-000000000006', 'organization', 'b4000000-0000-4000-8000-000000000002', 'data_requester', array['hiring_review'], '{}', now() + interval '30 days'), 'fixture: data_requester on grantee org 2');
  perform passport_test.reset();
end $f$;
insert into public.passport_consent_grants (id, grantor_type, grantor_id, grantee_type, grantee_id, subject_type, subject_id, purpose, requested_categories, approved_categories, status, requested_by, decided_at, decided_by, expires_at)
values ('d4000000-0000-4000-8000-000000000001', 'person', 'a1000000-0000-4000-8000-000000000001', 'organization', 'b4000000-0000-4000-8000-000000000001', 'person', 'a1000000-0000-4000-8000-000000000001',
        'hiring_review', array['credentials'], array['credentials'], 'active', 'a1000000-0000-4000-8000-000000000006', now(), 'a1000000-0000-4000-8000-000000000001', now() + interval '30 days');

-- ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────
-- Every CANARY_ token in the fixture, extracted from the fixture rows themselves so a newly-added canary is automatically checked.
create function m1.canaries() returns text[] language sql security definer set search_path = pg_catalog, public as $$
  select array_agg(distinct m[1]) from (
    select regexp_matches(t, '(CANARY_[A-Z0-9_]+)', 'g') as m from (
      select to_jsonb(c)::text as t from public.passport_claims c
      union all select to_jsonb(e)::text from public.passport_evidence e
      union all select to_jsonb(v)::text from public.passport_verifications v
    ) x) y $$;
-- canary canary_verification_reason / canary_status_reason are lower-case (they must satisfy a reason-code regex): matched case-insensitively
create function m1.leaks(p_output text) returns text language sql as $$
  select string_agg(distinct k, ', ') from unnest(m1.canaries() || array['canary_verification_reason', 'canary_status_reason']) k where p_output ilike '%' || k || '%' $$;
create function m1.public_json(p_claim uuid default null, p_profile uuid default 'a1000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.passport_public_claims(p_profile, p_claim) t $$;

-- ── M1-01 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-01"() returns void language plpgsql as $$
declare j jsonb; row_ jsonb;
begin
  perform passport_test.as_anon();
  j := m1.public_json();
  perform passport_test.check_true(jsonb_array_length(j) = 1, 'exactly ONE claim is public: the platform-derived, standard-sensitivity, verified, public one (got ' || jsonb_array_length(j) || ')');
  row_ := j -> 0;
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(row_) k) = array['claim_type','effective_at','expires_at','id','public_value'], 'EXACT public row shape: claim_type, effective_at, expires_at, id, public_value');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(row_ -> 'public_value') k) = array['activity_type','title'], 'EXACT public_value shape: activity_type, title');
  perform passport_test.check_true(row_ -> 'public_value' ->> 'title' = 'Welding workshop', 'CONTROL: the allow-listed value is really there (the projection is not just empty)');
  perform passport_test.check_true(m1.leaks(j::text) is null, 'no canary anywhere in the anonymous projection (leaked: ' || coalesce(m1.leaks(j::text), '') || ')');
  perform passport_test.reset();
end $$;

-- ── M1-02 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-02"() returns void language plpgsql as $$
declare col text;
begin
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_claims', 'anon cannot read the raw claims table at all');
  perform passport_test.raises('select * from public.passport_claims', 'anon cannot SELECT *');
  perform passport_test.raises(format('select * from public.passport_claims where id = %L', 'c4000000-0000-4000-8000-000000000001'), 'anon cannot fetch the public claim''s raw row by id');
  for col in select column_name from information_schema.columns where table_schema = 'public' and table_name = 'passport_claims' loop
    perform passport_test.raises(format('select %I from public.passport_claims', col), 'anon cannot select column ' || col);
  end loop;
  perform passport_test.raises('select count(*) from public.passport_claims tablesample bernoulli (100)', 'no sampling trick either');
  perform passport_test.reset();
  perform passport_test.check_true(not has_table_privilege('anon', 'public.passport_claims', 'select') and not has_any_column_privilege('anon', 'public.passport_claims', 'select'), 'CATALOG: anon holds no table-level and no column-level SELECT');
  perform passport_test.check_true(has_function_privilege('anon', 'public.passport_public_claims(uuid,uuid,integer)', 'execute'), 'CONTROL: anon CAN use the intended public projection');
end $$;

-- ── M1-03 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-03"() returns void language plpgsql as $$
declare out_ text;
begin
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_evidence', 'anon cannot read evidence');
  perform passport_test.raises('select count(*) from public.passport_claim_evidence', 'anon cannot read the claim<->evidence links');
  out_ := m1.public_json()::text || coalesce((select public.passport_claim_explanation('c4000000-0000-4000-8000-000000000001')::text), '');
  perform passport_test.check_true(m1.leaks(out_) is null, 'no evidence artifact / hash / provenance / storage path in the projection or the anonymous explanation (leaked: ' || coalesce(m1.leaks(out_), '') || ')');
  perform passport_test.check_true(out_ not ilike '%evidence%artifact%' and out_ not ilike '%storage%', 'and no evidence structure by name either');
  perform passport_test.reset();
  -- CONTROL: the evidence really is attached (the owner sees it), so "not in the output" means something
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000001');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_claim_evidence') >= 1, 'CONTROL: the owner does see the attached evidence link');
  perform passport_test.reset();
end $$;

-- ── M1-04 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-04"() returns void language plpgsql as $$
declare j jsonb; k text;
begin
  perform passport_test.as_anon();
  j := m1.public_json('c4000000-0000-4000-8000-000000000001');
  perform passport_test.check_true(jsonb_array_length(j) = 1, 'CONTROL: the claim is reachable by id');
  foreach k in array array['source_ref', 'source_system', 'issuer_id', 'issuer_type', 'issuer_kind', 'issuer_label', 'created_by', 'subject_id', 'subject_type', 'status', 'status_reason_code', 'visibility', 'sensitivity', 'superseded_by', 'created_at', 'updated_at', 'value'] loop
    perform passport_test.check_true(not (j -> 0 ? k), 'provenance/internal field "' || k || '" is not in the public row');
  end loop;
  perform passport_test.check_true(m1.leaks(j::text) is null, 'no provenance canary (source_ref / issuer_label / created_by...) leaked: ' || coalesce(m1.leaks(j::text), ''));
  perform passport_test.check_true(j::text not like '%a1000000-0000-4000-8000-000000000002%' and j::text not like '%a1000000-0000-4000-8000-000000000001%', 'neither the host/creator id nor the subject id appears');
  perform passport_test.reset();
end $$;

-- ── M1-05 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-05"() returns void language plpgsql as $$
declare j jsonb;
begin
  perform passport_test.as_anon();
  j := m1.public_json('c4000000-0000-4000-8000-000000000001') -> 0 -> 'public_value';
  perform passport_test.check_true(not (j ? 'private_note') and not (j ? 'contact_email') and not (j ? 'internal') and not (j ? 'activity_id') and not (j ? 'host_id'), 'unlisted value keys (private_note, contact_email, internal.*, activity_id, host_id) are dropped');
  perform passport_test.check_true(m1.leaks(j::text) is null, 'no value-level canary leaked: ' || coalesce(m1.leaks(j::text), ''));
  -- DEFAULT DENY: a claim type with no allow-list entry contributes NO value fields at all
  perform passport_test.check_true(public.passport_public_claim_value('credential.license', '{"class":"CANARY_UNLISTED_TYPE","x":1}') = '{}'::jsonb, 'an unlisted claim type has an EMPTY public value');
  perform passport_test.check_true(public.passport_public_claim_value('participation.activity', '{"title":{"CANARY_OBJECT":1},"activity_type":42}') = '{}'::jsonb, 'allow-listed keys with the wrong JSON type are dropped, not coerced');
  perform passport_test.check_true(length(public.passport_public_claim_value('participation.activity', jsonb_build_object('title', repeat('x', 5000))) ->> 'title') = 200, 'and free text is length-capped');
  perform passport_test.reset();
end $$;

-- ── M1-06 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-06"() returns void language plpgsql as $$
declare out_ text;
begin
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_consent_grants', 'anon cannot read consent grants');
  out_ := m1.public_json()::text || coalesce(public.passport_claim_explanation('c4000000-0000-4000-8000-000000000001')::text, '');
  perform passport_test.check_true(out_ not ilike '%consent%' and out_ not ilike '%hiring_review%' and out_ not ilike '%grantee%' and out_ not ilike '%d4000000-0000-4000-8000-000000000001%', 'no consent id / purpose / grantee in the anonymous projection or explanation');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000003');   -- X: a stranger
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 0, 'a signed-in stranger sees no grant about P either');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000001');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 1, 'CONTROL: the grantor (P) does see their own grant');
  perform passport_test.reset();
end $$;

-- ── M1-07 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-07"() returns void language plpgsql as $$
declare out_ text; t text;
begin
  perform passport_test.as_anon();
  foreach t in array array['passport_relationships', 'passport_verifications', 'passport_authority_assignments', 'passport_capture_requests', 'passport_integration_connections', 'passport_events'] loop
    perform passport_test.raises(format('select count(*) from public.%I', t), 'anon cannot read ' || t);
  end loop;
  out_ := m1.public_json()::text;
  perform passport_test.check_true(out_ !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' or (select bool_and(k in ('id')) from jsonb_object_keys((m1.public_json() -> 0)) k where (m1.public_json() -> 0 ->> k) ~ '^[0-9a-f]{8}-'), 'the only UUID-shaped value in the public row is the claim''s own id');
  perform passport_test.check_true(out_ not like '%b4000000-0000-4000-8000-000000000001%' and out_ not like '%d4000000-0000-4000-8000-000000000001%', 'no organization / relationship / grant identifier');
  perform passport_test.reset();
end $$;

-- ── M1-08 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-08"() returns void language plpgsql as $$
declare before_ text; after_ text; keys_before text[]; keys_after text[];
begin
  perform passport_test.as_anon(); before_ := m1.public_json()::text; keys_before := (select array_agg(k order by k) from jsonb_object_keys(m1.public_json() -> 0) k); perform passport_test.reset();
  -- the schema GROWS: a new column on the claims table (DDL is transactional in Postgres) and new keys inside `value`
  alter table public.passport_claims add column m1_future_secret text default 'CANARY_FUTURE_COLUMN';
  update public.passport_claims set m1_future_secret = 'CANARY_FUTURE_COLUMN_ROW' where id = 'c4000000-0000-4000-8000-000000000001';
  alter table public.passport_claims disable trigger user;
  update public.passport_claims set value = value || '{"future_field":"CANARY_FUTURE_VALUE_KEY","title_html":"CANARY_FUTURE_HTML"}' where id = 'c4000000-0000-4000-8000-000000000001';
  alter table public.passport_claims enable trigger user;
  perform passport_test.as_anon(); after_ := m1.public_json()::text; keys_after := (select array_agg(k order by k) from jsonb_object_keys(m1.public_json() -> 0) k); perform passport_test.reset();
  perform passport_test.check_true(keys_before = keys_after, 'the public row shape is unchanged after a new COLUMN and new value keys were added');
  perform passport_test.check_true(after_ = before_, 'the public projection is byte-identical before and after the schema grew');
  perform passport_test.check_true(after_ not ilike '%future%', 'no "future" field surfaced');
  perform passport_test.as_anon();
  perform passport_test.raises('select m1_future_secret from public.passport_claims', 'and anon has no privilege on the new column either (no default grant leaks it)');
  perform passport_test.reset();
  -- a NEW claim type is denied by default until someone deliberately allow-lists it
  perform passport_test.check_true(public.passport_public_claim_value('credential.brand_new_type', '{"a":"CANARY_NEW_TYPE"}') = '{}'::jsonb, 'a brand-new claim type is default-deny');
end $$;

-- ── M1-09 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-09"() returns void language plpgsql as $$
declare r record;
begin
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000001');
  select * into r from public.passport_claims where id = 'c4000000-0000-4000-8000-000000000001';
  perform passport_test.check_true(r.source_ref = 'CANARY_SOURCE_REF' and r.value ->> 'private_note' = 'CANARY_VALUE_PRIVATE_NOTE' and r.issuer_label = 'CANARY_ISSUER_LABEL', 'OWNER: the private/canonical view still carries the full row (source_ref, issuer, raw value)');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L', 'a1000000-0000-4000-8000-000000000001')) = 3, 'OWNER: sees ALL their claims, public or not');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_evidence') = 1, 'OWNER: sees their evidence');
  perform passport_test.check_true(jsonb_typeof(public.passport_claim_explanation('c4000000-0000-4000-8000-000000000001')) = 'object' and (public.passport_claim_explanation('c4000000-0000-4000-8000-000000000001') ->> 'ok')::boolean, 'OWNER: gets the explanation');
  perform passport_test.reset();
end $$;

-- ── M1-10 / 11 / 12: selective disclosure at the point of use (details: passport_v2_consent_relationships.test.sql §3–4) ─
create function m1."M1-10"() returns void language plpgsql as $$
declare r jsonb; g uuid := 'd4000000-0000-4000-8000-000000000001';
begin
  -- an authorised grantee principal is answered a NARROW question: yes/no + expiry, never a claim, value, issuer or evidence
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');
  r := public.passport_disclose(g, 'credential_held', null, 'work');
  perform passport_test.ok(r, 'CONTROL: the grantee organization''s owner may ask a covered question');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['answer','evaluated_at','expires_at','grant_id','ok','question'], 'EXACT disclosure shape: answer, evaluated_at, expires_at, grant_id, ok, question');
  perform passport_test.check_true(m1.leaks(r::text) is null, 'no canary in a disclosure answer');
  perform passport_test.denied(public.passport_disclose(g, 'claim_valid', 'skill.welding'), 'category_not_approved', 'a category the grant does not cover is refused');
  perform passport_test.denied(public.passport_disclose(g, 'give_me_everything'), 'unsupported_question', 'there is no bulk question');
  perform passport_test.check_true((public.passport_disclose(g, 'claim_valid', 'credential.identity') ->> 'reason') = 'category_not_approved' or (public.passport_disclose(g, 'claim_valid', 'credential.identity') ->> 'answer')::boolean is false, 'the sensitive identity claim is not disclosed without its own approval');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000003');
  perform passport_test.denied(public.passport_disclose(g, 'credential_held', null, 'work'), 'not_found', 'a stranger cannot use someone else''s grant');
  perform passport_test.reset();
end $$;

create function m1."M1-11"() returns void language plpgsql as $$
declare g uuid := 'd4000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');
  perform passport_test.ok(public.passport_disclose(g, 'credential_held', null, 'work'), 'CONTROL: answers while active');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000001');
  perform passport_test.ok(public.passport_revoke_consent(g, 'changed my mind'), 'the grantor revokes');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');
  perform passport_test.denied(public.passport_disclose(g, 'credential_held', null, 'work'), 'not_active', 'REVOKED: the very next question is refused');
  perform passport_test.reset();
end $$;

create function m1."M1-12"() returns void language plpgsql as $$
declare g uuid := 'd4000000-0000-4000-8000-0000000000e2';
begin
  insert into public.passport_consent_grants (id, grantor_type, grantor_id, grantee_type, grantee_id, subject_type, subject_id, purpose, requested_categories, approved_categories, status, requested_by, decided_at, decided_by, expires_at)
  values (g, 'person', 'a1000000-0000-4000-8000-000000000001', 'organization', 'b4000000-0000-4000-8000-000000000002', 'person', 'a1000000-0000-4000-8000-000000000001', 'hiring_review', array['credentials'], array['credentials'], 'active', 'a1000000-0000-4000-8000-000000000006', now(), 'a1000000-0000-4000-8000-000000000001', now() + interval '1 day');
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');
  perform passport_test.ok(public.passport_disclose(g, 'credential_held', null, 'work'), 'CONTROL: answers before expiry');
  perform passport_test.reset();
  update public.passport_consent_grants set expires_at = now() - interval '1 second' where id = g;   -- time passes; NO sweep has run
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000006');
  perform passport_test.denied(public.passport_disclose(g, 'credential_held', null, 'work'), 'expired', 'EXPIRED: refused even though no sweep has materialised the status');
  perform passport_test.reset();
end $$;

-- ── M1-13 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-13"() returns void language plpgsql as $$
declare a jsonb; x jsonb; ea jsonb; ex jsonb; claim uuid := 'c4000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_anon(); a := m1.public_json(); ea := public.passport_claim_explanation(claim);
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000003'); x := m1.public_json(); ex := public.passport_claim_explanation(claim);
  -- The public EXPLANATION is a second public surface with its own allow-list. Pin its exact shape at every level, so any field
  -- added later fails here and must be reviewed as a deliberate public disclosure (it is NOT "everything except a few secrets").
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(ea) k) = array['claim','evidence','history','issuer','ok','pending_verifications','source','verification','viewer'], 'EXACT public explanation top-level keys');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(ea -> 'claim') k) = array['claim_type','created_at','effective_at','effective_status','expires_at','id','sensitivity','status','status_reason_code','subject','visibility'], 'EXACT public explanation claim keys');
  perform passport_test.check_true(ea -> 'claim' -> 'sensitivity' = 'null'::jsonb and ea -> 'claim' -> 'status_reason_code' = 'null'::jsonb, 'the private claim fields are present as NULL only (contract shape), never with a value');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(ea -> 'source') k) = array['ref','system'] and ea -> 'source' -> 'ref' = 'null'::jsonb, 'source: system only; the source reference is null for the public');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(ea -> 'issuer') k) = array['kind','label'] and ea -> 'issuer' ->> 'label' is null, 'issuer: an EXTERNAL issuer''s free-text label is not public');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(ea -> 'verification') k) = array['decided_at','expires_at','method','reason_code','verifier'] and ea -> 'verification' -> 'verifier' ->> 'label' is null and ea -> 'verification' -> 'reason_code' = 'null'::jsonb, 'verification: method + when only; a PERSON verifier is unnamed and the reason code is null');
  perform passport_test.check_true(ea -> 'evidence' = '{"count":1}'::jsonb and ea -> 'history' = '[]'::jsonb and ea -> 'pending_verifications' = '[]'::jsonb, 'evidence is a bare count; history and pending requests are empty for the public');
  perform passport_test.check_true(a = x, 'an unauthorised signed-in user gets EXACTLY the anonymous projection');
  perform passport_test.check_true(ea = ex, 'and EXACTLY the anonymous explanation (same viewer class: public)');
  perform passport_test.check_true(m1.leaks(ex::text) is null, 'no canary in the stranger''s explanation: ' || coalesce(m1.leaks(ex::text), ''));
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', claim)) = 0, 'and no raw row');
  -- hidden claims are indistinguishable from nonexistent ones, for anon AND a stranger
  perform passport_test.check_true((public.passport_claim_explanation('c4000000-0000-4000-8000-000000000002') ->> 'reason') = 'not_found' and (public.passport_claim_explanation('c4000000-0000-4000-8000-000000000003') ->> 'reason') = 'not_found'
     and public.passport_claim_explanation('c4000000-0000-4000-8000-000000000002') = public.passport_claim_explanation(gen_random_uuid()), 'manual-source and sensitive claims answer exactly like a claim that never existed');
  perform passport_test.reset();
end $$;

-- ── M1-14 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-14"() returns void language plpgsql as $$
declare adm uuid := 'a1000000-0000-4000-8000-000000000005'; claim uuid := 'c4000000-0000-4000-8000-000000000001'; rev uuid := 'a1000000-0000-4000-8000-000000000007'; ver uuid; cl2 uuid;
begin
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', claim)) = 0, 'an admin at AAL1 cannot read the raw claim');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', claim)) = 1, 'CONTROL: an admin at AAL2 can audit it');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events') >= 0 and passport_test.count_of('select count(*) from public.passport_verifications') >= 1, 'CONTROL: and the verification internals');
  perform passport_test.reset();
  -- a reviewer sees ONLY the claim they were asked to decide, and loses it once decided
  insert into public.organizations (id, owner_id, name, verified) values ('b4000000-0000-4000-8000-0000000000aa', 'a1000000-0000-4000-8000-000000000003', 'M1 Reviewer Org', false);
  perform set_config('flow.internal_write', 'true', true); update public.organizations set verified = true where id = 'b4000000-0000-4000-8000-0000000000aa'; perform set_config('flow.internal_write', '', true);
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000003');
  perform passport_test.ok(public.passport_assign_authority(rev, 'organization', 'b4000000-0000-4000-8000-0000000000aa', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: reviewer authority');
  perform passport_test.reset();
  perform passport_test.as_user('a1000000-0000-4000-8000-000000000001');
  cl2 := (public.passport_create_claim('person', 'a1000000-0000-4000-8000-000000000001', 'credential.license', '{"k":"CANARY_REVIEW_ONLY"}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  ver := (public.passport_request_verification(cl2, 'organization_verified', 'organization', 'b4000000-0000-4000-8000-0000000000aa') ->> 'id')::uuid;
  perform passport_test.check_true(ver is not null, 'setup: P asks the reviewer org (draft claims submit on request)') ;
  perform passport_test.as_user(rev);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl2)) = 1, 'the ASKED reviewer can read the claim they must decide');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', claim)) = 0, 'but not P''s other claims');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events') = 0, 'and not the ledger');
  perform passport_test.reset();
end $$;

-- ── M1-15 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function m1."M1-15"() returns void language plpgsql as $$
declare bad text; allowed_fn text[] := array[
    'passport_public_claims(uuid,uuid,integer)',       -- the canonical public projection
    'passport_public_claim_value(text,jsonb)',          -- its allow-list value filter (pure)
    'passport_claim_explanation(uuid)',                 -- viewer-aware; its public branch delegates to the projection
    'passport_method_policy(text)', 'passport_relation_rule(text)',                       -- static policy tables (no user data)
    'passport_canonical_subject_type(text)', 'passport_claim_category(text)'];            -- static text lookups (no user data)
begin
  -- (a) No anon/PUBLIC-executable function in `public` may RETURN passport data unless it is on the reviewed allow-list above.
  --     A future function that forgets `revoke ... from public` fails HERE, instead of becoming a public endpoint.
  select string_agg(p.oid::regprocedure::text, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and p.proname ~* 'passport|claim|evidence|consent|verification|authority|relationship|capture'
     and pg_get_function_result(p.oid) not in ('trigger', 'boolean')
     and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') <> all (allowed_fn)
     and replace(p.oid::regprocedure::text, 'public.', '') <> all (allowed_fn);
  perform passport_test.check_true(bad is null, 'no UNREVIEWED anon-executable function returns passport data: ' || coalesce(bad, ''));
  -- (b) No relation with claim-shaped data is selectable by anon: every passport_* base table, every VIEW that depends on one.
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p', 'f') and c.relname like 'passport\_%'
     and c.relname <> 'passport_summary' and (has_table_privilege('anon', c.oid, 'select') or has_any_column_privilege('anon', c.oid, 'select'));
  perform passport_test.check_true(bad is null, 'anon cannot select ANY passport_* relation (other than the documented legacy view): ' || coalesce(bad, ''));
  select string_agg(distinct v.relname, ', ') into bad
    from pg_depend d join pg_rewrite r on r.oid = d.objid join pg_class v on v.oid = r.ev_class
   where d.refobjid in ('public.passport_claims'::regclass, 'public.passport_evidence'::regclass, 'public.passport_verifications'::regclass, 'public.passport_consent_grants'::regclass)
     and v.relkind in ('v', 'm') and v.oid <> d.refobjid and (has_table_privilege('anon', v.oid, 'select') or has_table_privilege('authenticated', v.oid, 'select'));
  perform passport_test.check_true(bad is null, 'no client-readable VIEW is built on claims/evidence/verifications/consent: ' || coalesce(bad, ''));
  -- (c) the documented legacy exception is what it claims to be: a view over the LEGACY tables, not over Passport V2 rows
  perform passport_test.check_true(not exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid where r.ev_class = 'public.passport_summary'::regclass and d.refobjid in ('public.passport_claims'::regclass, 'public.passport_evidence'::regclass)), 'passport_summary (legacy, accepted advisor exception) does not read Passport V2 claim or evidence rows');
  -- (d) authenticated users never get anything but SELECT on passport_* tables, and RLS is on everywhere
  perform passport_test.check_true(not exists (select 1 from information_schema.role_table_grants g join pg_tables t on t.tablename = g.table_name and t.schemaname = 'public' where g.grantee in ('authenticated', 'anon') and g.table_name like 'passport\_%' and g.privilege_type <> 'SELECT'), 'no client role holds a non-SELECT privilege on any passport_* table');
  perform passport_test.check_true(not exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'passport\_%' and not rowsecurity), 'RLS is enabled on every passport_* table');
  -- (e) every SECURITY DEFINER function of the Passport surface pins its search_path (a mutable path is a privilege-escalation vector)
  perform passport_test.check_true(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname ~ '^_?passport_' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'every passport SECURITY DEFINER function pins search_path');
  -- (f) the non-owner projection cannot be smuggled through a different arg shape: no bulk listing
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims()) = 0, 'no arguments -> nothing (never a directory)');
  perform passport_test.check_true((select count(*) from public.passport_public_claims(null, null, 1000)) = 0, 'a huge limit and no subject -> still nothing');
  perform passport_test.check_true((select count(*) from public.passport_public_claims('a1000000-0000-4000-8000-000000000001', null, 100000)) <= 50, 'the row limit is capped server-side');
  perform passport_test.reset();
end $$;

-- ── runner ───────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare f record; failed int; msg text;
begin
  for f in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'm1' and p.proname like 'M1-%' order by p.proname loop
    begin
      execute format('select m1.%I()', f.proname);
      insert into passport_test.m1_results values (f.proname, true, null);
    exception when others then
      perform passport_test.reset();
      get stacked diagnostics msg = message_text;
      insert into passport_test.m1_results values (f.proname, false, msg);
    end;
  end loop;
  select count(*) into failed from passport_test.m1_results where not ok;
  for f in select id, ok, detail from passport_test.m1_results order by id loop
    raise notice '% %  %', case when f.ok then 'PASS' else 'FAIL' end, f.id, coalesce(left(f.detail, 240), '');
  end loop;
  if (select count(*) from passport_test.m1_results) <> 15 then raise exception 'M1 matrix incomplete: expected 15 cases'; end if;
  if failed > 0 then raise exception 'M1 matrix: % of 15 cases FAILED', failed; end if;
end $$;

rollback;
select 'passport_v2_m1_public_projection: 15/15 cases passed' as result;
