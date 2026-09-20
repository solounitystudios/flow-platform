-- Passport V2 core: DB-level invariants (ledger, authority, claims, evidence,
-- verification). Runs inside ONE transaction that is rolled back, against the
-- throwaway database tests/db/replay.sh creates. Impersonates real roles and
-- JWT claims (request.jwt.claim.sub / request.jwt.claims) so RLS, grants and
-- RPC authorization are exercised exactly as PostgREST would exercise them.
-- Any failed assertion raises and aborts the run (psql ON_ERROR_STOP).
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
-- Org One has been verified BY FLOW (organizations.verified is never self-assigned by UPDATE; the guard trigger
-- honours this transaction-local internal-write flag, exactly like the admin RPC that grants it). An organization's
-- verification only counts once FLOW has verified the organization; Org Two deliberately stays unverified.
select set_config('flow.internal_write', 'true', true);
update public.organizations set verified = true where id = '01000000-0000-4000-8000-000000000001';
select set_config('flow.internal_write', '', true);

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
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'not_pending', 'a decision is final');
  perform passport_test.reset();
  -- (checked from a neutral vantage point: once the peer has decided they are no longer "asked", so — correctly —
  --  they can no longer read the claim through the owner/reviewer/admin-only base table)
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', 'claim is verified');
  perform passport_test.check_true((select expires_at from public.passport_claims where id = cl) is not null, 'verification carried an expiry onto the claim');

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
  -- (an overdue claim is not in the PUBLIC projection before the sweep either: exercised in section 15, with a
  --  platform-sourced claim, since the projection only headlines claims Passport itself derived)
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_claims', 'anon cannot read the raw claims table (overdue or not)');
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

  -- M1: the RAW table is not the public API. anon has no privilege on it at all, so no internal column can leak,
  -- whatever the row's visibility. (The PUBLIC Passport is served by passport_public_claims(); see section 15.)
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_claims', 'anon has no privilege on the raw claims table');
  perform passport_test.raises('select source_ref from public.passport_claims', 'anon cannot select source_ref');
  perform passport_test.raises('select created_by from public.passport_claims', 'anon cannot select created_by');
  perform passport_test.raises('select issuer_id from public.passport_claims', 'anon cannot select issuer_id');
  perform passport_test.raises('select value from public.passport_claims', 'anon cannot select the raw value');
  perform passport_test.raises('select count(*) from public.passport_evidence', 'anon has no privilege on evidence at all');

  perform passport_test.as_user(d);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'M1: a signed-in stranger cannot read the raw row of a public claim either (owner / asked reviewer / admin only)');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L and visibility = ''private''', c)) = 0, 'a stranger sees none of C''s private claims');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where subject_id = %L', c)) = 0, 'a stranger cannot read C''s audit history');

  -- Turning the person's passport private hides even their public claim
  perform passport_test.reset();
  update public.profiles set public_passport = false where id = c;
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
  perform passport_test.check_true((select count(*) from public.passport_public_claims(part)) = 0, 'private until the owner says otherwise');
  perform passport_test.as_user(part);
  perform passport_test.denied(public.passport_set_claim_visibility(cl, 'world'), 'invalid_disclosure', 'visibility validated');
  perform passport_test.ok(public.passport_set_claim_visibility(cl, 'public'), 'owner makes it public');
  perform passport_test.as_anon();
  -- (profiles.public_passport for C was switched off earlier in section 11; still hidden)
  perform passport_test.check_true((select count(*) from public.passport_public_claims(part)) = 0, 'public claim still hidden while the person''s passport is private');
  perform passport_test.reset();
  update public.profiles set public_passport = true where id = part;
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims(part)) = 1, 'visible in the public projection once passport + claim are both public');
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
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.table_name like 'passport\_%'
        and g.table_name in (select tablename from pg_tables where schemaname = 'public')
        and g.grantee = 'anon'),
    'M1: anon holds NO privilege at all on any passport_* base table (public data flows only through allow-listed functions)');
  perform passport_test.check_true(
    not exists (
      select 1 from information_schema.role_routine_grants g
      where g.routine_schema = 'public' and g.routine_name like '\_passport\_%' and g.grantee in ('anon', 'authenticated', 'PUBLIC')),
    'internal _passport_* functions are not executable by any client role');
end $$;

-- ── 15. M1: the PUBLIC Passport is an allow-listed projection, never the raw table ─
-- P completed a host-run activity (a platform-derived, verified claim) — the kind of claim a public Passport shows.
insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-000000000001', 'm1-host@test.local'),
  ('93000000-0000-4000-8000-000000000002', 'm1-p@test.local'),
  ('93000000-0000-4000-8000-000000000003', 'm1-stranger@test.local'),
  ('93000000-0000-4000-8000-000000000004', 'm1-blocked@test.local'),
  ('93000000-0000-4000-8000-000000000005', 'm1-peer@test.local');
do $$
declare
  host uuid := '93000000-0000-4000-8000-000000000001'; p uuid := '93000000-0000-4000-8000-000000000002';
  x uuid := '93000000-0000-4000-8000-000000000003'; w uuid := '93000000-0000-4000-8000-000000000004'; y uuid := '93000000-0000-4000-8000-000000000005';
  act uuid := '94000000-0000-4000-8000-0000000000aa'; cl uuid; forged uuid; r jsonb; j jsonb; n bigint; ghost uuid := gen_random_uuid();
  a1 jsonb; a2 jsonb;
begin
  insert into public.activities (id, created_by, title, activity_type, status) values (act, host, 'Welding workshop', 'workshop', 'published');
  perform passport_test.as_user(p);  insert into public.activity_participants (activity_id, profile_id) values (act, p);
  perform passport_test.as_user(host); perform passport_test.ok(public.check_in_activity_participant(act, p), 'setup: check in'); perform passport_test.ok(public.complete_activity_participant(act, p), 'setup: complete');
  perform passport_test.as_user(p);   r := public.passport_claim_from_activity(act); perform passport_test.ok(r, 'setup: P claims the outcome'); cl := (r ->> 'id')::uuid;
  perform passport_test.reset();
  update public.profiles set public_passport = true where id = p;

  -- PRIVATE by default: undiscoverable, whoever asks, however they ask
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'private claim: not in the projection (by profile)');
  perform passport_test.check_true((select count(*) from public.passport_public_claims(null, cl)) = 0, 'private claim: not in the projection (by claim id)');
  -- no existence oracle: a hidden claim and a claim that never existed answer IDENTICALLY
  a1 := (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.passport_public_claims(null, cl) t);
  a2 := (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.passport_public_claims(null, ghost) t);
  perform passport_test.check_true(a1 = a2 and a1 = '[]'::jsonb, 'hidden claim and nonexistent claim are indistinguishable');
  -- never a directory: neither a profile nor a claim id -> nothing
  perform passport_test.check_true((select count(*) from public.passport_public_claims()) = 0, 'no profile and no claim id: nothing (no bulk enumeration)');

  -- OWNER representation is intact: the owner still reads the full row; nobody else gets owner-level raw access
  perform passport_test.as_user(p);
  perform passport_test.check_true((select source_ref from public.passport_claims where id = cl) like 'activity_participants:%', 'OWNER: still reads the full canonical row (source_ref included)');
  perform passport_test.ok(public.passport_set_claim_visibility(cl, 'public'), 'owner makes it public');
  perform passport_test.as_user(x);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', cl)) = 0, 'OTHER signed-in user: no raw access to a PUBLIC claim');
  perform passport_test.as_anon();
  perform passport_test.raises(format('select source_ref from public.passport_claims where id = %L', cl), 'ANON: cannot retrieve source_ref of a public claim');
  perform passport_test.raises(format('select created_by from public.passport_claims where id = %L', cl), 'ANON: cannot retrieve created_by');
  perform passport_test.raises(format('select issuer_id from public.passport_claims where id = %L', cl), 'ANON: cannot retrieve the (private) issuer id');
  perform passport_test.raises(format('select status_reason_code from public.passport_claims where id = %L', cl), 'ANON: cannot retrieve status reasons');
  perform passport_test.raises(format('select value from public.passport_claims where id = %L', cl), 'ANON: cannot retrieve the raw value');
  perform passport_test.raises(format('select count(*) from public.passport_verifications where claim_id = %L', cl), 'ANON: no verification internals');
  perform passport_test.raises(format('select count(*) from public.passport_claim_evidence where claim_id = %L', cl), 'ANON: no evidence links');
  perform passport_test.raises('select count(*) from public.passport_evidence', 'ANON: no evidence or provenance');

  -- the Passport itself is still private -> even a public claim is hidden
  perform passport_test.reset();
  update public.profiles set public_passport = false where id = p;
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'public claim of a PRIVATE passport: hidden');
  perform passport_test.reset();
  update public.profiles set public_passport = true where id = p;

  -- ELIGIBLE: shown, and only in the allow-listed shape
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'eligible claim: returned');
  j := (select to_jsonb(t) from public.passport_public_claims(p) t);
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(j) k) = array['claim_type','effective_at','expires_at','id','public_value'], 'exact public shape: id, claim_type, effective_at, expires_at, public_value — nothing else');
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(j -> 'public_value') k) = array['activity_type','title'], 'public_value carries ONLY the allow-listed fields (title, activity_type)');
  perform passport_test.check_true(j::text not like '%activity_participants%' and j::text not like '%' || host::text || '%' and j::text not like '%' || p::text || '%' and j::text not like '%' || act::text || '%' and j::text not like '%source_record%', 'no source_ref, host/issuer id, subject id, activity id or verification detail anywhere in the projection');
  perform passport_test.check_true((select count(*) from public.passport_public_claims(null, cl)) = 1, 'the same claim is reachable by id (for its explanation page)');
  perform passport_test.check_true((select count(*) from public.passport_public_claims(x, cl)) = 0, 'a claim id under the WRONG profile answers nothing');
  perform passport_test.as_user(x);
  perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'a signed-in stranger gets the same projection as anon');

  -- INELIGIBLE states each drop it (fixtures as postgres; every restore is asserted so nothing passes vacuously)
  perform passport_test.reset();
  update public.passport_claims set sensitivity = 'sensitive' where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'SENSITIVE claim: hidden');
  perform passport_test.reset(); update public.passport_claims set sensitivity = 'standard' where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'CONTROL: back to eligible');
  perform passport_test.reset();
  update public.passport_claims set effective_at = now() - interval '3 days', expires_at = now() - interval '1 day' where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'EXPIRED claim (before any sweep): hidden');
  perform passport_test.reset(); update public.passport_claims set expires_at = null where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'CONTROL: back to eligible');
  perform passport_test.reset(); update public.passport_claims set status = 'stale' where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'STALE claim: hidden');
  perform passport_test.reset(); update public.passport_claims set status = 'verified' where id = cl;
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'CONTROL: back to eligible');
  -- blocked-user rule: a viewer the subject blocked sees nothing; another viewer still does
  perform passport_test.reset();
  insert into public.connections (requester_id, recipient_id, status) values (p, w, 'blocked');
  perform passport_test.as_user(w); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'BLOCKED viewer: hidden');
  perform passport_test.as_user(x); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1, 'CONTROL: an unblocked viewer still sees it');

  -- M4: a claim the MEMBER created (source manual) is never headlined, even with a public/verified peer-attested status
  perform passport_test.as_user(p);
  forged := (public.passport_create_claim('person', p, 'participation.activity', '{"title":"Led the NASA Mars mission","activity_type":"workshop"}', 'private', 'standard', now(), null, true) ->> 'id')::uuid;
  r := public.passport_request_verification(forged, 'peer_attested', 'person', y); perform passport_test.ok(r, 'setup: forged claim, peer asked');
  perform passport_test.as_user(y); perform passport_test.ok(public.passport_record_verification((r ->> 'id')::uuid, 'verified'), 'setup: a sock-puppet peer verifies it');
  perform passport_test.as_user(p); perform passport_test.ok(public.passport_set_claim_visibility(forged, 'public'), 'setup: made public');
  perform passport_test.reset();
  perform passport_test.check_true((select status || '/' || visibility from public.passport_claims where id = forged) = 'verified/public', 'setup: the forged claim really IS verified + public');
  perform passport_test.as_anon();
  perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 1 and not exists (select 1 from public.passport_public_claims(p) c where c.public_value ->> 'title' like '%NASA%'), 'M4: the member-created claim is NOT in the public projection; only the platform-derived one is');
  perform passport_test.check_true((select count(*) from public.passport_public_claims(null, forged)) = 0, 'M4: nor by id');
  perform passport_test.as_user(p);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L', p)) = 2, 'the owner still sees BOTH claims in the canonical table');

  -- revoked (terminal) drops it too
  perform passport_test.ok(public.passport_revoke_claim(cl, 'withdrawn_by_subject'), 'owner withdraws the activity claim');
  perform passport_test.as_anon(); perform passport_test.check_true((select count(*) from public.passport_public_claims(p)) = 0, 'REVOKED claim: hidden');
  perform passport_test.reset();
end $$;

-- ── 16. H2: verification independence is over CONTROL, not user ids ─────
-- The attack that used to work: person S owns an organization, gives a SECOND account authority in it, and that
-- account verifies S's claim "as" the organization. Different user ids, same controller. Every scenario below has a
-- POSITIVE CONTROL (an independent verification that must still succeed) so no denial can pass because the fixture
-- or the RPCs are simply broken.
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'h2-s@test.local'),    -- S   the claim subject
  ('91000000-0000-4000-8000-000000000002', 'h2-r@test.local'),    -- R   S's accomplice account (authority in S's own org A)
  ('91000000-0000-4000-8000-000000000003', 'h2-oi@test.local'),   -- OI  owner of the INDEPENDENT org I
  ('91000000-0000-4000-8000-000000000004', 'h2-ri@test.local'),   -- RI  reviewer for I
  ('91000000-0000-4000-8000-000000000005', 'h2-ob@test.local'),   -- OB  owner of org B (S is an ADMIN member)
  ('91000000-0000-4000-8000-000000000006', 'h2-rb@test.local'),   -- RB  reviewer for B
  ('91000000-0000-4000-8000-000000000007', 'h2-om@test.local'),   -- OM  owner of org M (S is a RECRUITER member)
  ('91000000-0000-4000-8000-000000000008', 'h2-rm@test.local'),   -- RM  reviewer for M
  ('91000000-0000-4000-8000-000000000009', 'h2-on@test.local'),   -- ON  owner of org N (NOT verified by FLOW)
  ('91000000-0000-4000-8000-00000000000a', 'h2-rn@test.local'),   -- RN  reviewer for N
  ('91000000-0000-4000-8000-00000000000b', 'h2-ot@test.local'),   -- OT  owner of org T (S holds authority there)
  ('91000000-0000-4000-8000-00000000000c', 'h2-rt@test.local');   -- RT  reviewer for T
insert into public.organizations (id, owner_id, name) values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'H2 Org A (owned by S)'),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000003', 'H2 Org I (independent)'),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000005', 'H2 Org B (S admin member)'),
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000007', 'H2 Org M (S recruiter member)'),
  ('92000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000009', 'H2 Org N (unverified)'),
  ('92000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-00000000000b', 'H2 Org T (S holds authority)'),
  ('92000000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000001', 'H2 Org A2 (S owns; subject org)'),
  ('92000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000001', 'H2 Org I2 (also owned by S)');
insert into public.organization_members (organization_id, profile_id, role, status) values
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'admin', 'active'),
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'recruiter', 'active');
select set_config('flow.internal_write', 'true', true);
update public.organizations set verified = true where id in (select id from public.organizations where name like 'H2 Org %' and name not like 'H2 Org N%');
select set_config('flow.internal_write', '', true);

do $$
declare
  s  uuid := '91000000-0000-4000-8000-000000000001'; r  uuid := '91000000-0000-4000-8000-000000000002';
  oi uuid := '91000000-0000-4000-8000-000000000003'; ri uuid := '91000000-0000-4000-8000-000000000004';
  ob uuid := '91000000-0000-4000-8000-000000000005'; rb uuid := '91000000-0000-4000-8000-000000000006';
  om uuid := '91000000-0000-4000-8000-000000000007'; rm uuid := '91000000-0000-4000-8000-000000000008';
  ono uuid := '91000000-0000-4000-8000-000000000009'; rn uuid := '91000000-0000-4000-8000-00000000000a';
  ot uuid := '91000000-0000-4000-8000-00000000000b'; rt uuid := '91000000-0000-4000-8000-00000000000c';
  oa uuid := '92000000-0000-4000-8000-000000000001'; oi_ uuid := '92000000-0000-4000-8000-000000000002'; ob_ uuid := '92000000-0000-4000-8000-000000000003';
  om_ uuid := '92000000-0000-4000-8000-000000000004'; on_ uuid := '92000000-0000-4000-8000-000000000005'; ot_ uuid := '92000000-0000-4000-8000-000000000006';
  oa2 uuid := '92000000-0000-4000-8000-000000000007'; oi2 uuid := '92000000-0000-4000-8000-000000000008';
  cl uuid; v uuid; r_ jsonb;
begin
  -- each owner scopes THEIR reviewer (credential.* claims) — S does the same for the accomplice inside S's own org
  perform passport_test.as_user(s);  perform passport_test.ok(public.passport_assign_authority(r,  'organization', oa,  'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: S gives accomplice R authority in S''s own org A');
  perform passport_test.as_user(oi); perform passport_test.ok(public.passport_assign_authority(ri, 'organization', oi_, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: independent reviewer RI');
  perform passport_test.as_user(ob); perform passport_test.ok(public.passport_assign_authority(rb, 'organization', ob_, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: reviewer RB');
  perform passport_test.as_user(om); perform passport_test.ok(public.passport_assign_authority(rm, 'organization', om_, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: reviewer RM');
  perform passport_test.as_user(ono); perform passport_test.ok(public.passport_assign_authority(rn, 'organization', on_, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: reviewer RN');
  perform passport_test.as_user(ot); perform passport_test.ok(public.passport_assign_authority(rt, 'organization', ot_, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup: reviewer RT');
  perform passport_test.ok(public.passport_assign_authority(s,  'organization', ot_, 'data_requester', array['hiring_review'], '{}', now() + interval '30 days'), 'setup: S holds an authority assignment in org T');
  perform passport_test.reset();

  -- the control sets, straight from the canonical helper (no RPC in the way)
  perform passport_test.check_true((select array_agg(principal_id order by principal_id) from public.passport_org_controllers(oa)) = array[s, r], 'controllers(A) = its owner + the account holding authority in it');
  perform passport_test.check_true((select array_agg(principal_id order by principal_id) from public.passport_org_controllers(ob_)) = array[s, ob, rb], 'controllers(B) includes an active ADMIN member (the legacy path''s own "owner/admin resolve" set)');
  perform passport_test.check_true(not exists (select 1 from public.passport_org_controllers(om_) c where c.principal_id = s), 'controllers(M) does NOT include a mere recruiter member');
  perform passport_test.check_true(s in (select principal_id from public.passport_org_controllers(ot_)), 'controllers(T) includes a holder of an active authority assignment');
  perform passport_test.check_true(public.passport_verifier_independent('person', s, 'organization', oi_), 'CONTROL: person S vs independent org I -> independent');
  perform passport_test.check_true(not public.passport_verifier_independent('person', s, 'organization', oa), 'person S vs org A that S owns -> NOT independent');
  perform passport_test.check_true(not public.passport_verifier_independent('person', s, 'business', oa), 'the "business" alias cannot dodge it');
  perform passport_test.check_true(public.passport_verifier_independent('person', s, 'system', null), 'the platform (system) verifier is always independent');

  -- ── 1. the subject verifies their own claim directly → REJECT (and the legitimate peer path still works)
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":1}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', s), 'verifier_is_subject', '1: cannot name yourself as verifier');
  r_ := public.passport_request_verification(cl, 'peer_attested', 'person', r);
  perform passport_test.ok(r_, '1 CONTROL: naming an independent peer is fine'); v := (r_ ->> 'id')::uuid;
  perform passport_test.denied(public.passport_record_verification(v, 'verified'), 'self_verification_not_allowed', '1: the subject cannot decide their own claim');
  perform passport_test.as_user(r);
  perform passport_test.ok(public.passport_record_verification(v, 'verified'), '1 CONTROL: the named independent peer CAN decide');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', '1 CONTROL: and the claim is verified');

  -- ── 2. S owns org A; a SECOND account holds reviewer authority in A → the H2 attack → REJECT, whichever way it is dressed
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":2}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', oa), 'verifier_not_independent', '2: an org S owns cannot verify S''s claim');
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'business',     oa), 'verifier_not_independent', '6: the organization issuer representation "business" changes nothing');
  perform passport_test.denied(public.passport_request_verification(cl, 'employer_verified',     'organization', oa), 'verifier_not_independent', '6: nor does switching method (employer_verified)');
  perform passport_test.denied(public.passport_request_verification(cl, 'licensed_provider',      'organization', oa), 'verifier_not_independent', '6: nor licensed_provider');
  perform passport_test.denied(public.passport_request_verification(cl, 'education_provider',     'organization', oa), 'verifier_not_independent', '6: nor education_provider');
  -- changing the authority assignment does not help either: control is about the ORG, not who is named to decide
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_authority((select id from public.passport_authority_assignments where principal_id = r and entity_id = oa and status = 'active'), 'rescope'), '6 setup: revoke the accomplice''s authority');
  perform passport_test.ok(public.passport_assign_authority(r, 'organization', oa, 'evidence_reviewer', '{}', array['credential.license'], now() + interval '30 days'), '6 setup: re-assign with a narrower, exact-match scope');
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', oa), 'verifier_not_independent', '6: a different authority assignment changes nothing');
  -- the accomplice cannot open the request themselves either (only the subject can)
  perform passport_test.as_user(r);
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', oa), 'not_found', '2: the accomplice cannot request on S''s behalf');
  perform passport_test.reset();
  -- 7: the refusals created NO decision and moved nothing
  perform passport_test.check_true((select count(*) from public.passport_verifications where claim_id = cl) = 0, '7: no verification row exists for the refused attack');
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'submitted', '7: the claim did not move (not under_review, certainly not verified)');
  -- ...and a PRIVILEGED writer cannot slip it through either: the guard trigger holds the line
  -- (two SEPARATE statements: the decision row must already be visible, or the guard would refuse for the wrong
  --  reason — "no decision" — and this assertion would pass even with the independence check deleted)
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (cl, 'organization_verified', 'organization', oa, 'completed', 'verified', now(), r);
  perform passport_test.check_true(exists (select 1 from public.passport_verifications where claim_id = cl and status = 'completed' and decision = 'verified'), '2/7 setup: a completed "verified" decision by the subject-controlled org IS on record');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', cl), '2/7: even a privileged writer cannot verify the claim through a subject-controlled org');
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'submitted', '7: still not verified after the privileged attempt');

  -- ── 3. S is an ADMIN member of org B (not its nominal owner) → REJECT (owner/admin resolve verifications in this repo)
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":3}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', ob_), 'verifier_not_independent', '3: an org S administers cannot verify S''s claim, though S is not its owner');

  -- ── 7b. S holds an active authority assignment in org T → S speaks for T → REJECT
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', ot_), 'verifier_not_independent', '3b: an org S holds authority in cannot verify S''s claim');

  -- ── 4. S is merely a RECRUITER member of org M → NOT control → allowed (an employer verifying an employee)
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":4}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  r_ := public.passport_request_verification(cl, 'organization_verified', 'organization', om_);
  perform passport_test.ok(r_, '4: a non-controlling member is not "control" — the org may verify'); v := (r_ ->> 'id')::uuid;
  -- ── 8. control CHANGES between request and decision → the decision re-checks it
  perform passport_test.reset();
  update public.organization_members set role = 'admin' where organization_id = om_ and profile_id = s;
  perform passport_test.as_user(rm);
  perform passport_test.denied(public.passport_record_verification(v, 'verified', 'documents_checked'), 'verifier_not_independent', '8: S was promoted to admin after the request; the decision is refused NOW');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'under_review', '8/7: the claim did not become verified');
  perform passport_test.check_true((select count(*) from public.passport_verifications where claim_id = cl and decision = 'verified') = 0, '8/7: and no successful decision exists');
  perform passport_test.check_true((select status from public.passport_verifications where id = v) = 'requested', '8: the request is still pending, untouched');
  update public.organization_members set role = 'recruiter' where organization_id = om_ and profile_id = s;
  perform passport_test.as_user(rm);
  perform passport_test.ok(public.passport_record_verification(v, 'verified', 'documents_checked'), '4/8 CONTROL: with control gone, the SAME reviewer''s decision succeeds');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', '4: verified through an org S does not control');

  -- ── 5. an unrelated independent, FLOW-verified organization → ALLOW
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":5}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  r_ := public.passport_request_verification(cl, 'organization_verified', 'organization', oi_);
  perform passport_test.ok(r_, '5: an independent organization may be asked'); v := (r_ ->> 'id')::uuid;
  perform passport_test.as_user(ri);
  perform passport_test.ok(public.passport_record_verification(v, 'verified', 'documents_checked'), '5: its authorized reviewer verifies');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', '5: legitimate independent verification still works end to end');

  -- ── organizations.verified is an ADDITIONAL, separately-enforced gate (established legacy rule)
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":6}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', on_), 'verifier_not_verified', 'an otherwise independent org FLOW has not verified cannot verify');
  perform passport_test.as_user(ono);
  perform passport_test.raises(format('update public.organizations set verified = true where id = %L', on_), 'an owner cannot self-assign organizations.verified by UPDATE');
  perform passport_test.reset();
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (cl, 'organization_verified', 'organization', on_, 'completed', 'verified', now(), rn);
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', cl), 'the guard also refuses an org FLOW has not verified (privileged writer, decision already on record)');
  -- the guard is not just blocking everything: the same shape through the independent, verified org passes
  update public.passport_claims set status = 'under_review' where id = cl;
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (cl, 'organization_verified', 'organization', oi_, 'completed', 'verified', now(), ri);
  update public.passport_claims set status = 'verified' where id = cl;
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'verified', 'CONTROL: the guard admits the same fixture through an independent, verified org');

  -- ── 9. a claim about an ORGANIZATION: independence applies to controllers of the subject org too
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('organization', oa2, 'credential.organization_issued', '{}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  perform passport_test.denied(public.passport_request_verification(cl, 'organization_verified', 'organization', oi2), 'verifier_not_independent', '9: another org with the SAME controller cannot verify an org S controls');
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', s), 'verifier_not_independent', '9: nor can S as a "peer" of an org S controls');
  r_ := public.passport_request_verification(cl, 'organization_verified', 'organization', oi_);
  perform passport_test.ok(r_, '9 CONTROL: an independent org may verify an org claim'); v := (r_ ->> 'id')::uuid;
  perform passport_test.as_user(ri);
  perform passport_test.ok(public.passport_record_verification(v, 'verified', 'documents_checked'), '9 CONTROL: and its reviewer can decide');
  perform passport_test.reset();

  -- ── 10. organizations.verified is re-checked at the DECISION, not only at the request
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('person', s, 'credential.license', '{"k":10}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  r_ := public.passport_request_verification(cl, 'organization_verified', 'organization', om_);
  perform passport_test.ok(r_, '10 setup: org M is verified, so the request opens'); v := (r_ ->> 'id')::uuid;
  perform passport_test.reset();
  perform set_config('flow.internal_write', 'true', true);
  update public.organizations set verified = false where id = om_;
  perform set_config('flow.internal_write', '', true);
  perform passport_test.as_user(rm);
  perform passport_test.denied(public.passport_record_verification(v, 'verified', 'documents_checked'), 'verifier_not_verified', '10: FLOW withdrew the org''s verification after the request; the decision is refused NOW');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_claims where id = cl) = 'under_review' and (select status from public.passport_verifications where id = v) = 'requested', '10: nothing moved');
  perform set_config('flow.internal_write', 'true', true);
  update public.organizations set verified = true where id = om_;
  perform set_config('flow.internal_write', '', true);
  perform passport_test.as_user(rm);
  perform passport_test.ok(public.passport_record_verification(v, 'verified', 'documents_checked'), '10 CONTROL: with the org verified again, the same decision succeeds');
  perform passport_test.reset();

  -- ── 11. a DECIDER who controls the subject (without being its nominal owner) is refused
  perform passport_test.as_user(s);
  cl := (public.passport_create_claim('organization', oa2, 'credential.organization_issued', '{"k":11}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  r_ := public.passport_request_verification(cl, 'organization_verified', 'organization', oi_);
  perform passport_test.ok(r_, '11 setup: independent org I is asked to verify S''s org A2'); v := (r_ ->> 'id')::uuid;
  perform passport_test.reset();
  insert into public.organization_members (organization_id, profile_id, role, status) values (oa2, ri, 'admin', 'active');   -- RI now administers the SUBJECT org
  perform passport_test.as_user(ri);
  perform passport_test.denied(public.passport_record_verification(v, 'verified', 'documents_checked'), 'self_verification_not_allowed', '11: an admin of the subject org cannot decide its claim, though they are not its owner');
  perform passport_test.reset();
  delete from public.organization_members where organization_id = oa2 and profile_id = ri;
  perform passport_test.as_user(ri);
  perform passport_test.ok(public.passport_record_verification(v, 'verified', 'documents_checked'), '11 CONTROL: without that role the same reviewer can decide');
  perform passport_test.reset();

  -- ── 12. organizations.owner_id alone is control (the owner-membership mirror row is a convenience, not the rule)
  delete from public.organization_members where organization_id = oa and profile_id = s and role = 'owner';
  perform passport_test.check_true(s in (select principal_id from public.passport_org_controllers(oa)), '12: the owner still controls their org even if the mirror membership row is missing');
  perform passport_test.check_true(not public.passport_verifier_independent('person', s, 'organization', oa), '12: and still cannot use it as an independent verifier');
end $$;

rollback;
select 'passport_v2_core: all assertions passed' as result;
