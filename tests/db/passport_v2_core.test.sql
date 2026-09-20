-- Passport V2 core: DB-level invariants (ledger, authority, claims, evidence,
-- verification). Runs inside ONE transaction that is rolled back, against the
-- throwaway database tests/db/replay.sh creates. Impersonates real roles and
-- JWT claims (request.jwt.claim.sub / request.jwt.claims) so RLS, grants and
-- RPC authorization are exercised exactly as PostgREST would exercise them.
-- Any failed assertion raises and aborts the run (psql ON_ERROR_STOP).
begin;

create schema passport_test;
grant usage on schema passport_test to public;

create function passport_test.as_user(uid uuid, aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'aal', aal, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function passport_test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function passport_test.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
create function passport_test.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
end $$;
create function passport_test.check_true(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ASSERTION FAILED: %', msg; end if;
end $$;
create function passport_test.ok(r jsonb, msg text) returns void language plpgsql as $$
begin
  if coalesce((r ->> 'ok')::boolean, false) is not true then raise exception 'ASSERTION FAILED: % (expected ok, got %)', msg, r; end if;
end $$;
create function passport_test.denied(r jsonb, reason text, msg text) returns void language plpgsql as $$
begin
  if coalesce((r ->> 'ok')::boolean, false) is true or (r ->> 'reason') is distinct from reason then
    raise exception 'ASSERTION FAILED: % (expected reason %, got %)', msg, reason, r;
  end if;
end $$;
-- Runs a statement and requires it to raise (any error). Works under any role.
create function passport_test.raises(stmt text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'ASSERTION FAILED: % (statement did not raise)', msg;
end $$;
create function passport_test.count_of(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin execute stmt into n; return n; end $$;
grant execute on all functions in schema passport_test to public;

-- ── fixtures ────────────────────────────────────────────────────────────
-- A  person, owner of organization O1
-- B  person, ADMIN-role member of O1 (a role — no authority)
-- C  person, named peer verifier
-- D  stranger
-- E  person granted evidence_reviewer authority on O1
-- ADM platform admin
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'a@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'b@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'c@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 'd@test.local'),
  ('e0000000-0000-4000-8000-000000000005', 'e@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'adm@test.local');
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Org One');
insert into public.organizations (id, owner_id, name) values ('02000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004', 'Org Two');
insert into public.organization_members (organization_id, profile_id, role, status)
  values ('01000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'admin', 'active');
insert into public.admins (profile_id, role, active) values ('f0000000-0000-4000-8000-000000000006', 'admin', true);

-- ── 1. grants: no client can write Passport tables directly ─────────────
do $$
declare t text;
begin
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  foreach t in array array['passport_events','passport_authority_assignments','passport_claims','passport_evidence','passport_claim_evidence','passport_verifications'] loop
    perform passport_test.raises(format('insert into public.%I default values', t), 'authenticated INSERT on ' || t);
    perform passport_test.raises(format('update public.%I set id = id', t), 'authenticated UPDATE on ' || t);
    perform passport_test.raises(format('delete from public.%I', t), 'authenticated DELETE on ' || t);
  end loop;
  perform passport_test.as_anon();
  perform passport_test.raises('select * from public.passport_events', 'anon SELECT on passport_events');
  perform passport_test.raises('select public.passport_create_claim(''person'', gen_random_uuid(), ''credential.skill'')', 'anon EXECUTE on passport_create_claim');
  perform passport_test.raises('select public._passport_emit_event(''claim.created'',''system'',''x'',''person'',gen_random_uuid())', 'anon EXECUTE on internal emitter');
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  perform passport_test.raises('select public._passport_emit_event(''claim.created'',''system'',''x'',''person'',gen_random_uuid())', 'authenticated EXECUTE on internal emitter');
  perform passport_test.reset();
end $$;

-- ── 2. authority: ROLE != AUTHORITY ─────────────────────────────────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; b uuid := 'b0000000-0000-4000-8000-000000000002';
        e uuid := 'e0000000-0000-4000-8000-000000000005'; o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  -- B holds the org `admin` ROLE. That must confer nothing.
  perform passport_test.as_user(b);
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'owner'), 'org admin role is not owner authority');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.skill'), 'org admin role is not evidence_reviewer');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'credential_issuer', null, 'credential.skill'), 'org admin role is not credential_issuer');
  r := public.passport_assign_authority(b, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days');
  perform passport_test.denied(r, 'not_entity_owner', 'org admin role cannot assign authority');

  -- The record owner proves `owner` (derived, not assigned) ...
  perform passport_test.as_user(a);
  perform passport_test.check_true(public.passport_has_authority('organization', o1, 'owner'), 'record ownership proves owner');
  -- ... but ownership does NOT silently include other authorities.
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.skill'), 'owner does not implicitly hold evidence_reviewer');

  -- Assignment guards
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'owner', '{}', array['credential'], now() + interval '30 days'), 'authority_not_assignable', 'owner is never assigned');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'guardian', '{}', array['credential'], now() + interval '30 days'), 'authority_not_assignable', 'guardian has no assignment path yet');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', '{}', now() + interval '30 days'), 'invalid_scope', 'unscoped authority refused');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], null), 'expiry_required', 'authority must expire');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '5 years'), 'expiry_invalid', 'authority expiry is bounded');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['Bad Prefix'], now() + interval '30 days'), 'invalid_scope', 'scope prefixes are validated');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', '02000000-0000-4000-8000-000000000002', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'not_entity_owner', 'cannot assign on an org you do not own');
  perform passport_test.denied(public.passport_assign_authority(e, 'agency', gen_random_uuid(), 'credential_issuer', '{}', array['credential'], now() + interval '30 days'), 'authority_entity_mismatch', 'no authority can be assigned for an agency (no resolver)');
  perform passport_test.denied(public.passport_assign_authority(gen_random_uuid(), 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'principal_not_found', 'principal must exist');

  -- Legit assignment, scoped to license claims
  r := public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential.license'], now() + interval '30 days');
  perform passport_test.ok(r, 'owner assigns scoped evidence_reviewer');
  perform passport_test.denied(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential.license'], now() + interval '30 days'), 'already_active', 'one active assignment per triple');

  perform passport_test.as_user(e);
  perform passport_test.check_true(public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.license'), 'assignee holds it in scope');
  perform passport_test.check_true(public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.license.cdl'), 'prefix matches child claim types');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.skill'), 'not outside scope');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.licensed'), 'prefix match is on a dot boundary, not a raw string prefix');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'credential_issuer', null, 'credential.license'), 'other authority types not implied');
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'owner'), 'authority never grants owner');
  perform passport_test.reset();

  -- Audit trail
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'authority.assigned' and subject_id = o1) = 1, 'authority.assigned event written');
end $$;

-- Expiry + revocation of authority
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; e uuid := 'e0000000-0000-4000-8000-000000000005';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; o1 uuid := '01000000-0000-4000-8000-000000000001'; aid uuid;
begin
  select id into aid from public.passport_authority_assignments where principal_id = e and entity_id = o1;
  -- lapse it (simulate time passing)
  update public.passport_authority_assignments set starts_at = now() - interval '2 days', expires_at = now() - interval '1 day' where id = aid;
  perform passport_test.as_user(e);
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.license'), 'expired authority confers nothing');
  perform passport_test.as_user(a);
  -- a lapsed assignment frees the slot for a fresh one
  r := public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential.license'], now() + interval '30 days');
  perform passport_test.ok(r, 're-assign after lapse');
  -- stranger can't revoke
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_revoke_authority((r ->> 'id')::uuid, 'nope'), 'not_authorized', 'stranger cannot revoke');
  -- owner can
  perform passport_test.as_user(a);
  perform passport_test.ok(public.passport_revoke_authority((r ->> 'id')::uuid, 'no longer needed'), 'owner revokes');
  perform passport_test.denied(public.passport_revoke_authority((r ->> 'id')::uuid, 'again'), 'not_active', 'cannot revoke twice');
  perform passport_test.as_user(e);
  perform passport_test.check_true(not public.passport_has_authority('organization', o1, 'evidence_reviewer', null, 'credential.license'), 'revoked authority confers nothing');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'authority.revoked') = 1, 'authority.revoked event written');
  -- restore for later scenarios
  perform passport_test.as_user(a);
  perform passport_test.ok(public.passport_assign_authority(e, 'organization', o1, 'evidence_reviewer', '{}', array['credential.license'], now() + interval '30 days'), 'restore E authority');
  perform passport_test.reset();
end $$;

-- ── 3. ledger is append-only ────────────────────────────────────────────
do $$
begin
  perform passport_test.check_true((select count(*) from public.passport_events) > 0, 'ledger has entries');
  perform passport_test.raises('update public.passport_events set payload = ''{}''', 'ledger UPDATE (even as owner role)');
  perform passport_test.raises('delete from public.passport_events', 'ledger DELETE (even as owner role)');
  perform passport_test.raises('truncate public.passport_events', 'ledger TRUNCATE (even as owner role)');
end $$;

-- ── 4. claims: creation, authorization, immutability ────────────────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; c uuid := 'c0000000-0000-4000-8000-000000000003';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; o1 uuid := '01000000-0000-4000-8000-000000000001'; cid uuid;
begin
  perform passport_test.as_user(a);
  r := public.passport_create_claim('person', a, 'credential.license', '{"class":"CDL-A"}');
  perform passport_test.ok(r, 'owner creates a draft claim about themselves');
  cid := (r ->> 'id')::uuid;
  perform passport_test.check_true((r ->> 'status') = 'draft', 'starts as draft');

  perform passport_test.denied(public.passport_create_claim('person', c, 'credential.license'), 'not_authorized', 'cannot create a claim about another person');
  perform passport_test.denied(public.passport_create_claim('vehicle', gen_random_uuid(), 'credential.license'), 'not_authorized', 'vehicle subjects have no ownership resolver yet — denied');
  perform passport_test.denied(public.passport_create_claim('person', a, 'License'), 'invalid_claim_type', 'claim types are namespaced');
  perform passport_test.denied(public.passport_create_claim('person', a, 'credential.license', '[]'), 'invalid_value', 'value must be an object');
  perform passport_test.denied(public.passport_create_claim('person', a, 'credential.license', '{}', 'public', 'sensitive'), 'sensitive_cannot_be_public', 'sensitive claims are never public');
  perform passport_test.denied(public.passport_create_claim('person', a, 'credential.license', '{}', 'world', 'standard'), 'invalid_disclosure', 'visibility is validated');
  perform passport_test.denied(public.passport_create_claim('person', a, 'credential.license', '{}', 'private', 'standard', now(), now() - interval '1 day'), 'invalid_window', 'expiry after effective');

  -- business alias folds to organization; the org owner may create
  r := public.passport_create_claim('business', o1, 'credential.organization_issued', '{"label":"Licensed operator"}');
  perform passport_test.ok(r, 'org owner creates a claim about the org via the business alias');
  perform passport_test.check_true((select subject_type from public.passport_claims where id = (r ->> 'id')::uuid) = 'organization', 'business folded into organization');

  -- another user can't touch it
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_submit_claim(cid), 'not_found', 'stranger cannot submit (no existence oracle)');
  perform passport_test.as_user(a);
  perform passport_test.ok(public.passport_submit_claim(cid), 'owner submits');
  perform passport_test.denied(public.passport_submit_claim(cid), 'not_a_draft', 'cannot submit twice');
  perform passport_test.reset();

  -- DB guards hold even for a privileged writer: a submitted claim cannot be
  -- flipped to verified without a completed verification decision on record.
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', cid), 'submitted -> verified with no verification decision on record');
end $$;

do $$
declare cid uuid; a uuid := 'a0000000-0000-4000-8000-000000000001'; r jsonb;
begin
  perform passport_test.as_user(a);
  r := public.passport_create_claim('person', a, 'credential.skill', '{"skill":"welding"}');
  cid := (r ->> 'id')::uuid;
  perform passport_test.reset();
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', cid), 'draft -> verified is illegal');
  perform passport_test.raises(format('update public.passport_claims set status = ''rejected'' where id = %L', cid), 'draft -> rejected is illegal');
  update public.passport_claims set status = 'submitted' where id = cid;  -- legal
  perform passport_test.raises(format('update public.passport_claims set value = ''{"skill":"other"}'' where id = %L', cid), 'value is immutable after submission');
  perform passport_test.raises(format('update public.passport_claims set claim_type = ''credential.other'' where id = %L', cid), 'claim_type is immutable after submission');
  perform passport_test.raises(format('update public.passport_claims set subject_id = gen_random_uuid() where id = %L', cid), 'subject is immutable');
  perform passport_test.raises(format('delete from public.passport_claims where id = %L', cid), 'claims are never deleted');
end $$;

-- ── 5. evidence: references only, subject-bound ─────────────────────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; d uuid := 'd0000000-0000-4000-8000-000000000004';
        c uuid := 'c0000000-0000-4000-8000-000000000003'; cl uuid; ev uuid; ev_d uuid;
        good jsonb := '[{"artifact_id":"doc-1","kind":"document","media_type":"application/pdf","storage":{"provider":"flow_storage","ref":"evidence/a/doc-1.pdf"},"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]';
begin
  perform passport_test.as_user(a);
  perform passport_test.denied(public.passport_add_evidence('person', a, 'document', '[{"artifact_id":"x","kind":"photo","media_type":"image/png","storage":{"provider":"external","ref":"data:image/png;base64,AAAA"}}]'), 'invalid_artifacts', 'inline blobs are rejected');
  perform passport_test.denied(public.passport_add_evidence('person', a, 'document', '[{"artifact_id":"x","kind":"photo","media_type":"image/png","storage":{"provider":"flow_capture","ref":"capture://s/x"}}]'), 'invalid_artifacts', 'users cannot forge Capture-provided artifacts');
  perform passport_test.denied(public.passport_add_evidence('person', a, 'document', '[{"artifact_id":"has space","kind":"photo","media_type":"image/png","storage":{"provider":"external","ref":"https://x"}}]'), 'invalid_artifacts', 'artifact ids are validated');
  perform passport_test.denied(public.passport_add_evidence('person', a, 'checkin', good), 'invalid_evidence_type', 'system-only evidence types are refused for users');
  perform passport_test.denied(public.passport_add_evidence('person', c, 'document', good), 'not_authorized', 'cannot add evidence for someone else');

  r := public.passport_add_evidence('person', a, 'document', good, '{"note":"scan of my license"}');
  perform passport_test.ok(r, 'owner adds evidence');
  ev := (r ->> 'id')::uuid;
  perform passport_test.check_true((select source_kind from public.passport_evidence where id = ev) = 'manual_upload', 'user evidence is manual_upload');
  perform passport_test.check_true((select status from public.passport_evidence where id = ev) = 'received', 'evidence is received, not accepted/verified');

  perform passport_test.as_user(d);
  ev_d := (public.passport_add_evidence('person', d, 'note', '[]') ->> 'id')::uuid;
  perform passport_test.as_user(a);
  cl := (public.passport_create_claim('person', a, 'credential.license', '{}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_attach_evidence(cl, ev_d), 'not_found', 'cannot attach another person''s evidence');
  perform passport_test.ok(public.passport_attach_evidence(cl, ev), 'attach own evidence');
  perform passport_test.denied(public.passport_attach_evidence(cl, ev), 'already_attached', 'no duplicate attachments');
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_attach_evidence(cl, ev), 'not_found', 'stranger cannot attach to my claim');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_evidence') = 1, 'stranger sees only their own evidence row');
  perform passport_test.reset();
  perform passport_test.raises(format('update public.passport_evidence set artifacts = ''[]'' where id = %L', ev), 'evidence content is immutable');
  perform passport_test.raises(format('delete from public.passport_evidence where id = %L', ev), 'evidence is never deleted');
  update public.passport_evidence set status = 'accepted' where id = ev;  -- status may change
end $$;

-- ── 6. verification: independent, method-bound, never self ─────────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; c uuid := 'c0000000-0000-4000-8000-000000000003';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; b uuid := 'b0000000-0000-4000-8000-000000000002';
        cl uuid; v uuid; ver_id uuid;
begin
  perform passport_test.as_user(a);
  cl := (public.passport_create_claim('person', a, 'attestation.peer', '{"who":"a"}', 'public', 'standard', null, null, true) ->> 'id')::uuid;

  perform passport_test.denied(public.passport_request_verification(cl, 'self_attested', 'person', a), 'method_cannot_verify', 'self-attestation can never yield verified');
  perform passport_test.denied(public.passport_request_verification(cl, 'government_issued', 'organization', '01000000-0000-4000-8000-000000000001'), 'method_not_available', 'government_issued is refused — no authoritative source exists');
  perform passport_test.denied(public.passport_request_verification(cl, 'external_source_verified', 'organization', '01000000-0000-4000-8000-000000000001'), 'method_not_available', 'external_source_verified is refused');
  perform passport_test.denied(public.passport_request_verification(cl, 'made_up', 'person', c), 'unknown_method', 'unknown method');
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', a), 'verifier_is_subject', 'cannot name yourself as your own peer');
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'organization', c), 'invalid_verifier', 'peer verifier must be a person');
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', gen_random_uuid()), 'verifier_not_found', 'verifier must exist');

  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', c), 'not_found', 'only the subject can request verification of a claim');

  perform passport_test.as_user(a);
  r := public.passport_request_verification(cl, 'peer_attested', 'person', c);
  perform passport_test.ok(r, 'subject asks a named peer');
  v := (r ->> 'id')::uuid;
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'under_review', 'claim moves to under_review');
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', c), 'already_requested', 'no duplicate open requests');

  -- nobody but the named peer can decide; the subject least of all
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'self_verification_not_allowed', 'subject cannot decide their own claim');
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_authorized', 'a stranger cannot decide');
  perform passport_test.as_user(b);
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_authorized', 'an org-admin ROLE holder cannot decide a peer request');

  -- before deciding, the named peer can see the claim (and only because they were asked)
  perform passport_test.as_user(c);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 1, 'named peer can read the claim they were asked to verify');
  perform passport_test.denied(public.passport_record_verification(v, 'rejected'), 'reason_code_required', 'a rejection must say why');
  perform passport_test.denied(public.passport_record_verification(v, 'verified', null, now() - interval '1 day'), 'expiry_not_in_future', 'expiry must be in the future');
  r := public.passport_record_verification(v, 'verified', null, now() + interval '180 days');
  perform passport_test.ok(r, 'named peer verifies');
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', 'claim is verified');
  perform passport_test.check_true((select expires_at from public.passport_claims where id = cl) is not null, 'verification carried an expiry onto the claim');
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_pending', 'a decision is final');
  perform passport_test.reset();

  perform passport_test.raises(format('update public.passport_verifications set decision = ''rejected'' where id = %L', v), 'completed verification is immutable');
  perform passport_test.raises(format('delete from public.passport_verifications where id = %L', v), 'verification history is never deleted');

  -- audit trail: every consequential step left an event, in order
  perform passport_test.check_true((select count(*) from public.passport_events where refs ->> 'claim_id' = cl::text and event_type = 'claim.submitted') = 1, 'claim.submitted');
  perform passport_test.check_true((select count(*) from public.passport_events where refs ->> 'claim_id' = cl::text and event_type = 'verification.requested') = 1, 'verification.requested');
  perform passport_test.check_true((select count(*) from public.passport_events where refs ->> 'claim_id' = cl::text and event_type = 'verification.completed') = 1, 'verification.completed');
  perform passport_test.check_true((select count(*) from public.passport_events where refs ->> 'claim_id' = cl::text and event_type = 'claim.verified') = 1, 'claim.verified');
  -- events describe, they don't leak claim contents
  perform passport_test.check_true(not exists (select 1 from public.passport_events where payload::text like '%"who"%'), 'event payloads never carry claim values');
end $$;

-- ── 7. verification by an ENTITY: authority, scope, independence ────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; b uuid := 'b0000000-0000-4000-8000-000000000002';
        c uuid := 'c0000000-0000-4000-8000-000000000003'; d uuid := 'd0000000-0000-4000-8000-000000000004';
        e uuid := 'e0000000-0000-4000-8000-000000000005'; o1 uuid := '01000000-0000-4000-8000-000000000001';
        lic uuid; skl uuid; vlic uuid; vskl uuid;
begin
  -- C asks Org One to verify a license claim AND a skill claim
  perform passport_test.as_user(c);
  lic := (public.passport_create_claim('person', c, 'credential.license', '{"class":"CDL-A"}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  skl := (public.passport_create_claim('person', c, 'credential.skill', '{"skill":"welding"}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  vlic := (public.passport_request_verification(lic, 'organization_verified', 'organization', o1) ->> 'id')::uuid;
  vskl := (public.passport_request_verification(skl, 'organization_verified', 'organization', o1) ->> 'id')::uuid;

  -- The org's admin-ROLE holder cannot decide
  perform passport_test.as_user(b);
  perform passport_test.denied(public.passport_record_verification(vlic, 'verified'), 'not_authorized', 'org admin role holder cannot verify');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', lic)) = 0, 'org admin role holder cannot even read the claim');
  -- The org OWNER can't either, without an assignment (ownership proves ownership, not reviewing rights)
  perform passport_test.as_user(a);
  perform passport_test.denied(public.passport_record_verification(vlic, 'verified'), 'not_authorized', 'owner without an evidence_reviewer assignment cannot verify');
  -- D owns a different org: no authority over Org One
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_record_verification(vlic, 'verified'), 'not_authorized', 'other org owner cannot verify');

  -- E holds evidence_reviewer for credential.license ONLY
  perform passport_test.as_user(e);
  perform passport_test.denied(public.passport_record_verification(vskl, 'verified'), 'not_authorized', 'authority scope excludes credential.skill');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', skl)) = 0, 'out-of-scope reviewer cannot read the skill claim');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', lic)) = 1, 'in-scope reviewer can read the license claim');
  perform passport_test.ok(public.passport_record_verification(vlic, 'verified'), 'scoped authority holder verifies in scope');
  -- once decided, the request is closed and the reviewer's read access to the claim ends (least privilege)
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', lic)) = 0, 'reviewer loses read access once the decision is made');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = lic) = 'verified', 'license claim verified');

  -- After being asked, the owner can grant THEMSELVES the authority (audited) and then act
  perform passport_test.as_user(a);
  perform passport_test.ok(public.passport_assign_authority(a, 'organization', o1, 'evidence_reviewer', '{}', array['credential.skill'], now() + interval '10 days'), 'owner deliberately assigns self the authority');
  perform passport_test.ok(public.passport_record_verification(vskl, 'rejected', 'insufficient_evidence'), 'now the owner, holding the authority, decides');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = skl) = 'rejected', 'skill claim rejected');
  perform passport_test.check_true((select status_reason_code from public.passport_claims where id = skl) = 'insufficient_evidence', 'reason code recorded');
  perform passport_test.reset();

  -- A rejected claim cannot be verified afterwards
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', skl), 'rejected -> verified is illegal');

  -- Independence: an organization can't verify a claim about itself
  perform passport_test.as_user(a);
  r := public.passport_create_claim('organization', o1, 'credential.organization_issued', '{}', 'private', 'standard', null, null, true);
  perform passport_test.denied(public.passport_request_verification((r ->> 'id')::uuid, 'organization_verified', 'organization', o1), 'verifier_is_subject', 'org cannot verify itself');
  perform passport_test.reset();
end $$;

-- ── 8. platform verification: admin at AAL2 only ────────────────────────
do $$
declare r jsonb; c uuid := 'c0000000-0000-4000-8000-000000000003'; adm uuid := 'f0000000-0000-4000-8000-000000000006';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; cl uuid; v uuid;
begin
  perform passport_test.as_user(c);
  cl := (public.passport_create_claim('person', c, 'credential.identity', '{}', 'private', 'sensitive', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'platform_verified', 'person', adm), 'invalid_verifier', 'platform verification names the system, not a person');
  v := (public.passport_request_verification(cl, 'platform_verified', 'system') ->> 'id')::uuid;
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_authorized', 'non-admin cannot platform-verify');
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_authorized', 'admin at AAL1 cannot platform-verify');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.ok(public.passport_record_verification(v, 'verified'), 'admin at AAL2 platform-verifies');
  perform passport_test.reset();
end $$;

-- ── 9. revocation ───────────────────────────────────────────────────────
do $$
declare r jsonb; a uuid := 'a0000000-0000-4000-8000-000000000001'; c uuid := 'c0000000-0000-4000-8000-000000000003';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; e uuid := 'e0000000-0000-4000-8000-000000000005';
        adm uuid := 'f0000000-0000-4000-8000-000000000006'; lic uuid;
begin
  select id into lic from public.passport_claims where subject_id = c and claim_type = 'credential.license';
  perform passport_test.as_user(d);
  perform passport_test.denied(public.passport_revoke_claim(lic, 'because'), 'not_found', 'stranger cannot revoke');
  perform passport_test.as_user(e);
  perform passport_test.denied(public.passport_revoke_claim(lic, 'Bad Code'), 'reason_code_required', 'reason code shape');
  perform passport_test.ok(public.passport_revoke_claim(lic, 'issued_in_error'), 'the verifying authority holder can revoke');
  perform passport_test.denied(public.passport_revoke_claim(lic, 'again'), 'not_revocable', 'revoked is final except supersession');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = lic) = 'revoked', 'claim revoked');
  perform passport_test.check_true((select count(*) from public.passport_verifications where claim_id = lic and decision = 'revoked') = 1, 'revocation recorded as a verification decision with context');
  perform passport_test.check_true((select revocation_context ->> 'by' from public.passport_verifications where claim_id = lic and decision = 'revoked') = 'verifier', 'revocation context says who');

  -- a subject can withdraw their own claim
  perform passport_test.as_user(c);
  r := public.passport_create_claim('person', c, 'credential.education', '{}', 'private', 'standard', null, null, true);
  perform passport_test.ok(public.passport_revoke_claim((r ->> 'id')::uuid, 'withdrawn_by_subject'), 'subject withdraws their own claim');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'claim.revoked') = 2, 'both revocations audited');
end $$;

-- ── 10. expiry ──────────────────────────────────────────────────────────
do $$
declare c uuid := 'c0000000-0000-4000-8000-000000000003'; a uuid := 'a0000000-0000-4000-8000-000000000001'; cl uuid; n integer;
begin
  select id into cl from public.passport_claims where subject_id = a and claim_type = 'attestation.peer';
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', 'precondition: verified claim');
  -- simulate the window closing (postgres bypasses the guard's time, not its rules)
  update public.passport_claims set effective_at = now() - interval '3 days', expires_at = now() - interval '1 day' where id = cl;
  -- a public, verified-but-overdue claim must not be publicly visible even before the sweep runs
  perform passport_test.as_anon();
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'an overdue claim is not publicly visible before the sweep');
  perform passport_test.as_user(a);
  n := public.passport_expire_due_claims();
  perform passport_test.check_true(n = 1, 'sweep expired exactly the overdue claim');
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'expired', 'claim is expired');
  perform passport_test.check_true(public.passport_expire_due_claims() = 0, 'sweep is idempotent');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'claim.expired' and refs ->> 'claim_id' = cl::text) = 1, 'claim.expired audited once');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', cl), 'expired -> verified is illegal');
end $$;

-- ── 11. read isolation (RLS) ────────────────────────────────────────────
do $$
declare a uuid := 'a0000000-0000-4000-8000-000000000001'; c uuid := 'c0000000-0000-4000-8000-000000000003';
        d uuid := 'd0000000-0000-4000-8000-000000000004'; adm uuid := 'f0000000-0000-4000-8000-000000000006'; cl uuid;
begin
  -- a fresh, public, verified claim by C (via platform verification below is heavy; use direct fixture as postgres)
  perform passport_test.as_user(c);
  cl := (public.passport_create_claim('person', c, 'credential.community', '{"k":"v"}', 'public', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.reset();
  -- fixture shortcut for the read tests: a completed decision on record, then the (now legal) flip
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (cl, 'peer_attested', 'person', 'a0000000-0000-4000-8000-000000000001', 'completed', 'verified', now(), 'a0000000-0000-4000-8000-000000000001');
  update public.passport_claims set status = 'verified' where id = cl;

  perform passport_test.as_anon();
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 1, 'anon sees a public, verified claim of a public passport');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_claims where visibility = ''private''') = 0, 'anon never sees private claims');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_claims where status in (''draft'',''submitted'',''under_review'',''rejected'',''revoked'')') = 0, 'anon never sees unverified/terminal claims');
  perform passport_test.raises('select count(*) from public.passport_evidence', 'anon has no privilege on evidence at all');

  perform passport_test.as_user(d);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 1, 'a stranger sees the public claim');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L and visibility = ''private''', c)) = 0, 'a stranger sees none of C''s private claims');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where subject_id = %L', c)) = 0, 'a stranger cannot read C''s audit history');

  -- Turning the person's passport private hides even their public claim
  perform passport_test.reset();
  update public.profiles set public_passport = false where id = c;
  perform passport_test.as_anon();
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'profiles.public_passport = false hides the public claim');
  perform passport_test.as_user(c);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 1, 'owner still sees it');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where subject_id = %L', c)) > 0, 'owner reads their own audit history');

  -- Admin: AAL2 only
  perform passport_test.as_user(adm, 'aal1');
  -- (an admin still reads events they themselves performed — the actor rule — but nothing else)
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where actor_id <> %L', adm::text)) = 0, 'admin at AAL1 cannot read anyone else''s ledger entries');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L and visibility = ''private''', c)) = 0, 'admin at AAL1 cannot read private claims');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where actor_id <> %L', adm::text)) > 0, 'admin at AAL2 can audit everyone''s ledger entries');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L', c)) > 1, 'admin at AAL2 can read claims');
  perform passport_test.reset();
end $$;

-- ── 12. service role: no client-role shortcut, but no silent hole either ─
do $$
begin
  perform passport_test.as_service();
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events') > 0, 'service_role can read the ledger');
  perform passport_test.raises('update public.passport_events set payload = ''{}''', 'even service_role cannot rewrite the ledger');
  perform passport_test.reset();
end $$;


-- ── 13. real-data path: host-completed Flow Activity -> canonical claim ──
do $$
declare r jsonb; r2 jsonb; host uuid := 'a0000000-0000-4000-8000-000000000001'; part uuid := 'c0000000-0000-4000-8000-000000000003';
        stranger uuid := 'd0000000-0000-4000-8000-000000000004'; other_part uuid := 'e0000000-0000-4000-8000-000000000005';
        act uuid; cl uuid; ev uuid;
begin
  insert into public.activities (id, created_by, title, activity_type, status)
    values ('aa000000-0000-4000-8000-0000000000aa', host, 'Welding workshop', 'workshop', 'published');
  act := 'aa000000-0000-4000-8000-0000000000aa';

  -- participant joins as themselves; still only registered
  perform passport_test.as_user(part);
  insert into public.activity_participants (activity_id, profile_id) values (act, part);
  perform passport_test.denied(public.passport_claim_from_activity(act), 'not_eligible', 'a merely registered participant cannot claim');
  -- a non-participant cannot claim
  perform passport_test.as_user(stranger);
  perform passport_test.denied(public.passport_claim_from_activity(act), 'not_eligible', 'a non-participant cannot claim');

  -- host attends then completes
  perform passport_test.as_user(host);
  perform passport_test.ok(public.check_in_activity_participant(act, part), 'host checks in');
  perform passport_test.as_user(part);
  perform passport_test.denied(public.passport_claim_from_activity(act), 'not_eligible', 'attended-but-not-completed still cannot claim');
  perform passport_test.as_user(host);
  perform passport_test.ok(public.complete_activity_participant(act, part), 'host completes');

  -- other users still can't claim someone else's completion
  perform passport_test.as_user(other_part);
  perform passport_test.denied(public.passport_claim_from_activity(act), 'not_eligible', 'cannot claim another person''s completion');

  perform passport_test.as_user(part);
  r := public.passport_claim_from_activity(act);
  perform passport_test.ok(r, 'the completed participant claims their outcome');
  cl := (r ->> 'id')::uuid;
  perform passport_test.check_true((r ->> 'already_exists')::boolean is false, 'first call creates');
  r2 := public.passport_claim_from_activity(act);
  perform passport_test.ok(r2, 'second call is safe');
  perform passport_test.check_true((r2 ->> 'id')::uuid = cl and (r2 ->> 'already_exists')::boolean, 'idempotent: same claim, nothing duplicated');

  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where source_ref like %L', 'activity_participants:%')) = 1, 'exactly one claim exists');
  perform passport_test.reset();

  -- the chain is complete and honest about its source
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', 'claim is verified');
  perform passport_test.check_true((select issuer_type || ':' || issuer_id from public.passport_claims where id = cl) = 'person:' || host::text, 'issuer is the host');
  perform passport_test.check_true((select visibility from public.passport_claims where id = cl) = 'private', 'private by default — the subject chooses to disclose');
  select e.id into ev from public.passport_evidence e join public.passport_claim_evidence ce on ce.evidence_id = e.id where ce.claim_id = cl;
  perform passport_test.check_true((select source_kind from public.passport_evidence where id = ev) = 'flow_activity', 'evidence source_kind is flow_activity');
  perform passport_test.check_true((select provenance ->> 'recorded_by' from public.passport_evidence where id = ev) = 'host', 'provenance says the host recorded it');
  perform passport_test.check_true((select jsonb_array_length(artifacts) from public.passport_evidence where id = ev) = 0, 'a source-record evidence carries no artifacts');
  perform passport_test.check_true((select method || '/' || verifier_type || '/' || reason_code from public.passport_verifications where claim_id = cl) = 'platform_verified/system/source_record', 'verification says exactly what happened: the source record, not an admin or a peer');
  perform passport_test.check_true((select array_agg(event_type order by seq) from public.passport_events where refs ->> 'claim_id' = cl::text) = array['claim.created','evidence.attached','verification.completed','claim.verified'], 'exactly the expected audit events, in order, for the claim');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'evidence.created' and refs ->> 'evidence_id' = ev::text) = 1, 'evidence.created audited');

  -- disclosure switch
  perform passport_test.as_user(stranger);
  perform passport_test.denied(public.passport_set_claim_visibility(cl, 'public'), 'not_found', 'stranger cannot change visibility');
  perform passport_test.as_anon();
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'private until the owner says otherwise');
  perform passport_test.as_user(part);
  perform passport_test.denied(public.passport_set_claim_visibility(cl, 'world'), 'invalid_disclosure', 'visibility validated');
  perform passport_test.ok(public.passport_set_claim_visibility(cl, 'public'), 'owner makes it public');
  perform passport_test.as_anon();
  -- (profiles.public_passport for C was switched off earlier in section 11; still hidden)
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'public claim still hidden while the person''s passport is private');
  perform passport_test.reset();
  update public.profiles set public_passport = true where id = part;
  perform passport_test.as_anon();
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 1, 'visible once passport + claim are both public');
  perform passport_test.reset();
end $$;


-- ── 14. structural hygiene (what the Supabase advisor flags) ────────────
do $$
begin
  perform passport_test.check_true(
    not exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'passport\_%' and not rowsecurity),
    'every passport_* table has RLS enabled');
  perform passport_test.check_true(
    not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'passport\_%' or p.proname like '\_passport\_%')
        and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
    'every passport SECURITY DEFINER function pins search_path');
  perform passport_test.check_true(
    not exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name like 'passport\_%'
        -- real tables only: the legacy passport_summary VIEW predates this work and is out of scope here
        and g.table_name in (select tablename from pg_tables where schemaname = 'public')
        and g.grantee in ('anon', 'authenticated') and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
    'no client role holds write/DDL-ish privileges on any passport_* table');
  perform passport_test.check_true(
    not exists (
      select 1 from information_schema.role_routine_grants g
      where g.routine_schema = 'public' and g.routine_name like '\_passport\_%' and g.grantee in ('anon', 'authenticated', 'PUBLIC')),
    'internal _passport_* functions are not executable by any client role');
end $$;

rollback;
select 'passport_v2_core: all assertions passed' as result;
