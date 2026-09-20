-- Passport V2: consent grants, selective disclosure, relationships.
-- (helpers are prepended by tests/db/replay.sh; this file ends by rolling back)

-- ── fixtures ────────────────────────────────────────────────────────────
-- G    grantor (a person with a verified license + a legacy 'work' badge)
-- OWN  owner of Org One          REQ  person who will hold data_requester on O1
-- MEM  Org One ADMIN-role member (a role — no authority)
-- O2   owner of Org Two          X    stranger          MEN  a mentor
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'g@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'own@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'req@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 'mem@test.local'),
  ('e0000000-0000-4000-8000-000000000005', 'o2@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'x@test.local'),
  ('f1000000-0000-4000-8000-000000000007', 'men@test.local');
insert into public.organizations (id, owner_id, name) values
  ('01000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Org One'),
  ('02000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000005', 'Org Two');
insert into public.organization_members (organization_id, profile_id, role, status)
  values ('01000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'admin', 'active');

-- G's verified, valid license claim (fixture shortcut: a completed decision on record, then the legal flip)
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, status, effective_at, expires_at, created_by)
  values ('c1000000-0000-4000-8000-000000000001', 'person', 'a0000000-0000-4000-8000-000000000001', 'credential.license', '{"class":"CDL-A","secret_detail":"do-not-leak"}', 'submitted', now() - interval '10 days', now() + interval '100 days', 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, status, decision, decided_at)
  values ('c1000000-0000-4000-8000-000000000001', 'platform_verified', 'system', 'completed', 'verified', now());
update public.passport_claims set status = 'verified' where id = 'c1000000-0000-4000-8000-000000000001';
-- a sensitive verified identity claim
insert into public.passport_claims (id, subject_type, subject_id, claim_type, sensitivity, status, effective_at, created_by)
  values ('c2000000-0000-4000-8000-000000000002', 'person', 'a0000000-0000-4000-8000-000000000001', 'credential.identity', 'sensitive', 'submitted', now(), 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, status, decision, decided_at)
  values ('c2000000-0000-4000-8000-000000000002', 'platform_verified', 'system', 'completed', 'verified', now());
update public.passport_claims set status = 'verified' where id = 'c2000000-0000-4000-8000-000000000002';
-- a legacy credential badge
insert into public.profile_credentials (profile_id, credential_type, title) values ('a0000000-0000-4000-8000-000000000001', 'work', 'Verified work');

-- ── 1. consent: who may request ─────────────────────────────────────────
do $$
declare r jsonb; g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'c0000000-0000-4000-8000-000000000003'; mem uuid := 'd0000000-0000-4000-8000-000000000004';
        o2 uuid := 'e0000000-0000-4000-8000-000000000005'; x uuid := 'f0000000-0000-4000-8000-000000000006';
        o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_user(mem);
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'hiring_review', array['credentials']), 'not_authorized', 'an org ADMIN-role member cannot request data on behalf of the org');
  perform passport_test.as_user(own);
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'hiring_review', array['credentials']), 'not_authorized', 'even the org OWNER needs an explicit data_requester authority');
  perform passport_test.denied(public.passport_request_consent(g, 'agency', gen_random_uuid(), 'hiring_review', array['credentials']), 'not_authorized', 'agencies have no path to request consent');
  perform passport_test.denied(public.passport_request_consent(g, 'program', gen_random_uuid(), 'program_enrollment', array['credentials']), 'not_authorized', 'programs have no path to request consent');

  -- owner delegates a PURPOSE-SCOPED data_requester to REQ
  perform passport_test.ok(public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['credential_check'], '{}', now() + interval '60 days'), 'owner assigns purpose-scoped data_requester');

  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'hiring_review', array['credentials']), 'not_authorized', 'authority scoped to credential_check cannot request for hiring_review');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o2, 'credential_check', array['credentials']), 'not_authorized', 'authority on Org One does not extend to Org Two');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['credentials','skills']), 'category_not_allowed_for_purpose', 'a purpose cannot ask for categories outside it (minimisation)');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['location']), 'category_not_allowed_for_purpose', 'credential_check can never ask for location');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array[]::text[]), 'no_categories', 'must ask for something specific');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['credentials','credentials']), 'duplicate_category', 'no duplicate categories');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['bogus']), 'invalid_category', 'unknown category');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'blanket_access', array['credentials']), 'invalid_purpose', 'there is no blanket purpose');
  perform passport_test.denied(public.passport_request_consent(gen_random_uuid(), 'organization', o1, 'credential_check', array['credentials']), 'not_found', 'grantor must exist');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['credentials'], 'opportunity', null), 'invalid_context', 'context is a pair');

  r := public.passport_request_consent(g, 'organization', o1, 'credential_check', array['credentials'], 'event', 'e1000000-0000-4000-8000-0000000000e1');
  perform passport_test.ok(r, 'authorized requester asks for the narrow thing');
  perform passport_test.denied(public.passport_request_consent(g, 'organization', o1, 'credential_check', array['credentials'], 'event', 'e1000000-0000-4000-8000-0000000000e1'), 'already_open', 'no duplicate open request');

  -- visibility of the request
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 1, 'the requester sees their request');
  perform passport_test.as_user(mem);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 0, 'org admin-role member cannot see the org''s requests');
  perform passport_test.as_user(x);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 0, 'a stranger sees no requests');
  perform passport_test.as_user(o2);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 0, 'another org owner sees no requests');
  perform passport_test.as_user(g);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_consent_grants') = 1, 'the grantor sees requests about them');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'consent.requested' and subject_id = g) = 1, 'consent.requested audited on the grantor''s history');
end $$;

-- ── 2. consent: only the grantor decides; narrowing only; always expiring ─
do $$
declare r jsonb; id uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'c0000000-0000-4000-8000-000000000003'; x uuid := 'f0000000-0000-4000-8000-000000000006';
        o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  select g2.id into id from public.passport_consent_grants g2 where grantor_id = g and purpose = 'credential_check';

  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_respond_consent(id, true), 'not_found', 'the requester cannot approve their own request');
  perform passport_test.as_user(own);
  perform passport_test.denied(public.passport_respond_consent(id, true), 'not_found', 'the org owner cannot approve their own request');
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_respond_consent(id, true), 'not_found', 'a stranger cannot decide');
  perform passport_test.denied(public.passport_revoke_consent(id), 'not_found', 'a stranger cannot revoke');

  perform passport_test.as_user(g);
  perform passport_test.denied(public.passport_respond_consent(id, true, array['credentials','skills']), 'approved_exceeds_request', 'approval cannot widen the request');
  perform passport_test.denied(public.passport_respond_consent(id, true, array[]::text[]), 'nothing_approved', 'approving nothing is not approval');
  perform passport_test.denied(public.passport_respond_consent(id, true, null, now() - interval '1 day'), 'expiry_not_in_future', 'expiry must be future');
  perform passport_test.denied(public.passport_respond_consent(id, true, null, now() + interval '400 days'), 'expiry_too_far', 'no grant longer than 365 days');
  perform passport_test.denied(public.passport_revoke_consent(id), 'not_active', 'nothing to revoke before it is granted');
  r := public.passport_respond_consent(id, true, null, now() + interval '30 days');
  perform passport_test.ok(r, 'grantor approves');
  perform passport_test.check_true((r ->> 'status') = 'active', 'active');
  perform passport_test.denied(public.passport_respond_consent(id, false), 'not_pending', 'a decision is final');
  perform passport_test.reset();

  perform passport_test.raises(format('update public.passport_consent_grants set approved_categories = array[''credentials'',''contact''] where id = %L', id), 'approved scope is fixed once decided');
  perform passport_test.raises(format('update public.passport_consent_grants set purpose = ''hiring_review'' where id = %L', id), 'grant terms are immutable');
  perform passport_test.raises(format('update public.passport_consent_grants set expires_at = now() + interval ''300 days'' where id = %L', id), 'an active grant cannot be extended in place');
  perform passport_test.raises(format('update public.passport_consent_grants set status = ''requested'' where id = %L', id), 'active cannot go back to requested');
  perform passport_test.raises(format('delete from public.passport_consent_grants where id = %L', id), 'grants are never deleted');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'consent.granted' and subject_id = g) = 1, 'consent.granted audited');
end $$;

-- decline / withdraw lifecycle
do $$
declare r jsonb; a uuid; b uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'c0000000-0000-4000-8000-000000000003'; x uuid := 'f0000000-0000-4000-8000-000000000006'; o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_assign_authority(own, 'organization', o1, 'data_requester', array['hiring_review','event_entry'], '{}', now() + interval '60 days'), 'owner deliberately assigns self a data_requester authority');
  r := public.passport_request_consent(g, 'organization', o1, 'hiring_review', array['credentials','skills']);
  perform passport_test.ok(r, 'request 1'); a := (r ->> 'id')::uuid;
  perform passport_test.as_user(g);
  perform passport_test.ok(public.passport_respond_consent(a, false), 'grantor declines');
  perform passport_test.as_user(own);
  perform passport_test.check_true((select status from public.passport_consent_grants where id = a) = 'declined', 'declined');
  -- a declined request can be asked again later (a NEW request), never resurrected
  perform passport_test.raises(format('update public.passport_consent_grants set status = ''active'' where id = %L', a), 'declined never becomes active');
  r := public.passport_request_consent(g, 'organization', o1, 'event_entry', array['credentials']);
  perform passport_test.ok(r, 'request 2'); b := (r ->> 'id')::uuid;
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_withdraw_consent_request(b), 'not_found', 'a stranger cannot withdraw');
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_withdraw_consent_request(b), 'requester withdraws');
  perform passport_test.denied(public.passport_withdraw_consent_request(b), 'not_pending', 'cannot withdraw twice');
  perform passport_test.as_user(g);
  perform passport_test.denied(public.passport_respond_consent(b, true), 'not_pending', 'a withdrawn request cannot be approved');
  perform passport_test.reset();
end $$;

-- ── 3. selective disclosure: answers, not data ──────────────────────────
do $$
declare r jsonb; id uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'c0000000-0000-4000-8000-000000000003'; mem uuid := 'd0000000-0000-4000-8000-000000000004';
        x uuid := 'f0000000-0000-4000-8000-000000000006'; o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  select g2.id into id from public.passport_consent_grants g2 where grantor_id = g and purpose = 'credential_check' and status = 'active';

  perform passport_test.as_user(req);
  r := public.passport_disclose(id, 'claim_valid', 'credential.license');
  perform passport_test.ok(r, 'the authorized requester asks: is the license valid?');
  perform passport_test.check_true((r ->> 'answer')::boolean is true, 'yes');
  perform passport_test.check_true(r ->> 'expires_at' is not null, 'the expiry is part of the answer when valid');
  -- NOTHING but the answer is in the response
  perform passport_test.check_true((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['answer','evaluated_at','expires_at','grant_id','ok','question'], 'response carries only question/answer/expiry/grant/time');
  perform passport_test.check_true(r::text not like '%CDL-A%' and r::text not like '%do-not-leak%' and r::text not like '%c1000000%', 'no claim value, detail or id leaks');

  perform passport_test.check_true((public.passport_disclose(id, 'claim_valid', 'credential.other') ->> 'answer')::boolean is false, 'no such claim -> no');
  perform passport_test.denied(public.passport_disclose(id, 'claim_valid', 'skill.welding'), 'category_not_approved', 'a category the grant does not cover is refused');
  -- a sensitive claim without an identity_attributes approval answers "no" — indistinguishable from
  -- "there is none", so the response never reveals that a sensitive claim exists
  perform passport_test.check_true((public.passport_disclose(id, 'claim_valid', 'credential.identity') ->> 'answer')::boolean is false, 'sensitive identity claim is not disclosed without identity_attributes, and its existence is not revealed');
  perform passport_test.denied(public.passport_disclose(id, 'claim_valid', 'weird.type'), 'unsupported_claim_type', 'claim types outside any category are not disclosable');
  perform passport_test.denied(public.passport_disclose(id, 'age_over', null), 'unsupported_question', '"is this person 18+" is not offered — Flow holds no date of birth');
  perform passport_test.denied(public.passport_disclose(id, 'give_me_everything', null), 'unsupported_question', 'no bulk question exists');
  perform passport_test.check_true((public.passport_disclose(id, 'credential_held', null, 'work') ->> 'answer')::boolean is true, 'legacy credential badge held -> yes');
  perform passport_test.check_true((public.passport_disclose(id, 'credential_held', null, 'mentor') ->> 'answer')::boolean is false, 'legacy credential badge not held -> no');

  -- only the grantee's authorized principals can ask
  perform passport_test.as_user(mem);
  perform passport_test.denied(public.passport_disclose(id, 'claim_valid', 'credential.license'), 'not_found', 'an org admin-ROLE member cannot use the org''s grant');
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_disclose(id, 'claim_valid', 'credential.license'), 'not_found', 'a stranger cannot use it');
  perform passport_test.as_user(g);
  perform passport_test.denied(public.passport_disclose(id, 'claim_valid', 'credential.license'), 'not_found', 'not even the grantor is the grantee');

  -- the subject can see every disclosure made about them
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where event_type = ''credential.shared'' and subject_id = %L', g)) >= 3, 'credential.shared events are visible to the subject');
  perform passport_test.as_user(x);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events where event_type = ''credential.shared''') = 0, 'a stranger cannot see disclosures');
  perform passport_test.reset();
end $$;

-- a wider grant (with identity_attributes) unlocks sensitive claims — and only then
do $$
declare r jsonb; id uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_user(own);
  -- (own already holds data_requester for hiring_review + event_entry from the previous block)
  r := public.passport_request_consent(g, 'organization', o1, 'event_entry', array['credentials','identity_attributes']);
  perform passport_test.ok(r, 'event_entry request'); id := (r ->> 'id')::uuid;
  perform passport_test.as_user(g);
  perform passport_test.ok(public.passport_respond_consent(id, true), 'grantor approves both');
  perform passport_test.as_user(own);
  perform passport_test.check_true((public.passport_disclose(id, 'claim_valid', 'credential.identity') ->> 'answer')::boolean is true, 'with identity_attributes approved, the sensitive claim answers');
  perform passport_test.reset();
end $$;

-- ── 4. revoke / expire: access ends immediately ─────────────────────────
do $$
declare gid uuid; gid2 uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; req uuid := 'c0000000-0000-4000-8000-000000000003';
        own uuid := 'b0000000-0000-4000-8000-000000000002'; n integer;
begin
  select g2.id into gid from public.passport_consent_grants g2 where grantor_id = g and purpose = 'credential_check' and status = 'active';
  perform passport_test.as_user(g);
  perform passport_test.denied(public.passport_revoke_consent(gid, repeat('x', 300)), 'reason_too_long', 'reason bounded');
  perform passport_test.ok(public.passport_revoke_consent(gid, 'changed my mind'), 'grantor revokes');
  perform passport_test.denied(public.passport_revoke_consent(gid), 'not_active', 'cannot revoke twice');
  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_disclose(gid, 'claim_valid', 'credential.license'), 'not_active', 'a revoked grant answers nothing');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'consent.revoked' and subject_id = g) = 1, 'consent.revoked audited');

  -- expiry: simulate the window closing on the other active grant
  select g2.id into gid2 from public.passport_consent_grants g2 where grantor_id = g and purpose = 'event_entry' and status = 'active';
  update public.passport_consent_grants set expires_at = now() - interval '1 minute' where id = gid2;   -- (postgres: shrinking is allowed)
  perform passport_test.as_user(own);
  perform passport_test.denied(public.passport_disclose(gid2, 'claim_valid', 'credential.identity'), 'expired', 'an expired grant answers nothing, even before the sweep runs');
  n := public.passport_expire_due_consents();
  perform passport_test.check_true(n = 1, 'sweep expired the one overdue grant');
  perform passport_test.check_true(public.passport_expire_due_consents() = 0, 'sweep is idempotent');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_consent_grants where id = gid2) = 'expired', 'status materialised');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'consent.expired') >= 1, 'consent.expired audited');
  perform passport_test.raises(format('update public.passport_consent_grants set status = ''active'' where id = %L', gid2), 'expired never becomes active again');
end $$;

-- direct table writes are impossible for clients
do $$
begin
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  perform passport_test.raises('insert into public.passport_consent_grants (grantor_type, grantor_id, grantee_type, grantee_id, subject_type, subject_id, purpose, requested_categories, expires_at) values (''person'', gen_random_uuid(), ''organization'', gen_random_uuid(), ''person'', gen_random_uuid(), ''hiring_review'', array[''credentials''], now())', 'a client cannot forge a grant');
  perform passport_test.raises('update public.passport_consent_grants set status = ''active''', 'a client cannot activate a grant');
  perform passport_test.raises('delete from public.passport_consent_grants', 'a client cannot delete grants');
  perform passport_test.as_anon();
  perform passport_test.raises('select * from public.passport_consent_grants', 'anon cannot read grants');
  perform passport_test.reset();
end $$;

-- ── 5. relationships ────────────────────────────────────────────────────
do $$
declare r jsonb; rid uuid; g uuid := 'a0000000-0000-4000-8000-000000000001'; men uuid := 'f1000000-0000-4000-8000-000000000007';
        x uuid := 'f0000000-0000-4000-8000-000000000006'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        o1 uuid := '01000000-0000-4000-8000-000000000001'; o2 uuid := 'e0000000-0000-4000-8000-000000000005';
        ev uuid := 'e1000000-0000-4000-8000-0000000000e1';
begin
  insert into public.events (id, created_by, title, starts_at) values (ev, o2, 'Community fair', now() + interval '10 days');

  perform passport_test.as_user(men);
  perform passport_test.denied(public.passport_propose_relationship('person', g, 'mentor_of', 'person', g), 'not_authorized', 'cannot propose on behalf of someone else');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'guardian_of', 'person', g), 'relation_not_available', 'guardian_of is refused until the guardian model exists');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'authorized_for', 'vehicle', gen_random_uuid()), 'relation_not_available', 'vehicle relationships have no resolver yet');
  perform passport_test.denied(public.passport_propose_relationship('vehicle', gen_random_uuid(), 'approved_for', 'event', ev), 'relation_not_available', 'approved_for is not available yet');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'works_at', 'organization', o1), 'relation_managed_elsewhere', 'works_at lives in organization_members');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'attended', 'event', ev), 'relation_managed_elsewhere', 'attendance lives in event_attendance');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'mentor_of', 'organization', o1), 'invalid_relation_endpoints', 'endpoint types are enforced');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'mentor_of', 'person', men), 'self_relationship', 'no self relationships');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'mentor_of', 'person', gen_random_uuid()), 'not_found', 'target must exist');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'nonsense', 'person', g), 'unknown_relation', 'unknown relation');

  r := public.passport_propose_relationship('person', men, 'mentor_of', 'person', g);
  perform passport_test.ok(r, 'a mentor proposes'); rid := (r ->> 'id')::uuid;
  perform passport_test.check_true((r ->> 'status') = 'pending', 'pending until the mentee accepts');
  perform passport_test.denied(public.passport_propose_relationship('person', men, 'mentor_of', 'person', g), 'already_exists', 'no duplicate live relationships');

  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_respond_relationship(rid, true), 'not_found', 'a stranger cannot accept');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_relationships') = 0, 'a stranger cannot see it');
  perform passport_test.as_user(men);
  perform passport_test.denied(public.passport_respond_relationship(rid, true), 'not_found', 'the proposer cannot accept their own proposal');
  perform passport_test.as_user(g);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_relationships') = 1, 'the mentee sees the proposal');
  perform passport_test.ok(public.passport_respond_relationship(rid, true), 'the mentee accepts');
  perform passport_test.denied(public.passport_respond_relationship(rid, true), 'not_pending', 'already decided');

  -- both sides can read the history
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where refs ->> ''relationship_id'' = %L and subject_id = %L', rid, g)) = 2, 'mentee sees created + accepted');
  perform passport_test.as_user(men);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_events where refs ->> ''relationship_id'' = %L and subject_id = %L', rid, men)) = 2, 'mentor sees created + accepted');

  -- ROLE/RELATIONSHIP != AUTHORITY: an ACTIVE mentor_of grants the mentor nothing over the mentee
  perform passport_test.check_true(not public.passport_subject_owner_ok('person', g), 'a mentor is not the record owner of the mentee');
  perform passport_test.denied(public.passport_create_claim('person', g, 'credential.skill', '{"skill":"x"}'), 'not_authorized', 'a mentor cannot create claims for the mentee');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where subject_id = %L', g)) = 0, 'a mentor cannot read the mentee''s claims');
  perform passport_test.denied(public.passport_request_consent(g, 'person', men, 'credential_check', array['credentials']), 'not_authorized', 'a person may only request consent for mentorship');
  perform passport_test.ok(public.passport_request_consent(g, 'person', men, 'mentorship', array['skills']), 'a mentor may ask (not take) via consent, for the mentorship purpose only');

  -- ending keeps history
  perform passport_test.ok(public.passport_end_relationship(rid, 'program finished'), 'either end can end it');
  perform passport_test.reset();
  perform passport_test.check_true((select status || ':' || (ended_at is not null)::text from public.passport_relationships where id = rid) = 'ended:true', 'ended, with a timestamp, row kept');
  perform passport_test.raises(format('update public.passport_relationships set status = ''active'' where id = %L', rid), 'ended relationships never come back');
  perform passport_test.raises(format('delete from public.passport_relationships where id = %L', rid), 'relationships are never deleted');
  perform passport_test.as_user(men);
  perform passport_test.denied(public.passport_end_relationship(rid), 'not_endable', 'already ended');
  -- a new mentorship after ending is a new row
  perform passport_test.ok(public.passport_propose_relationship('person', men, 'mentor_of', 'person', g), 'a fresh proposal is allowed after ending');

  -- organization participates_in event (real, native: needs the event owner's acceptance)
  perform passport_test.as_user(own);
  r := public.passport_propose_relationship('business', o1, 'participates_in', 'event', ev);
  perform passport_test.ok(r, 'org owner proposes org participation via the business alias'); rid := (r ->> 'id')::uuid;
  perform passport_test.check_true((r ->> 'status') = 'pending', 'pending');
  perform passport_test.check_true((select from_type from public.passport_relationships where id = rid) = 'organization', 'business folded');
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_propose_relationship('organization', o1, 'participates_in', 'event', ev), 'not_authorized', 'a stranger cannot propose for someone else''s org');
  perform passport_test.as_user(o2);
  perform passport_test.ok(public.passport_respond_relationship(rid, true), 'the event owner accepts');
  perform passport_test.reset();
end $$;

-- ── 6. legacy relationships, adapted (read-only, RLS still applies) ─────
do $$
declare g uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'b0000000-0000-4000-8000-000000000002';
        mem uuid := 'd0000000-0000-4000-8000-000000000004'; x uuid := 'f0000000-0000-4000-8000-000000000006';
        o1 uuid := '01000000-0000-4000-8000-000000000001'; ev uuid := 'e1000000-0000-4000-8000-0000000000e1';
        act uuid := 'aa000000-0000-4000-8000-0000000000aa';
begin
  -- fixtures in the legacy tables
  -- The attendance lifecycle trigger (correctly) forces new rows to 'registered'. Simulate a row a host
  -- already checked in by bypassing that trigger for this fixture insert only (transaction is rolled back).
  alter table public.event_attendance disable trigger user;
  insert into public.event_attendance (event_id, profile_id, status, checked_in_at, checkin_code) values (ev, g, 'attended', now(), 'FIXTURE01');
  alter table public.event_attendance enable trigger user;
  insert into public.activities (id, created_by, title, activity_type, status) values (act, own, 'Workshop', 'workshop', 'published');
  insert into public.activity_participants (activity_id, profile_id, status) values (act, g, 'registered');
  insert into public.connections (requester_id, recipient_id, status) values (g, x, 'accepted');

  perform passport_test.as_user(own);
  perform passport_test.check_true((select relation || ':' || status from public.passport_relationships_legacy where from_id = own and to_id = o1) = 'owns:active', 'org owner row projects as owns:active');
  perform passport_test.check_true((select relation || ':' || status from public.passport_relationships_legacy where from_id = mem and to_id = o1) = 'member_of:active', 'member row projects as member_of — the ROLE is not projected');
  perform passport_test.check_true((select count(*) from information_schema.columns where table_name = 'passport_relationships_legacy' and column_name = 'role') = 0, 'no role column exists on the relationship view');

  -- history: removing a member ends the relationship
  perform passport_test.reset();
  update public.organization_members set status = 'removed', removed_at = now() where profile_id = mem;
  perform passport_test.as_user(own);
  perform passport_test.check_true((select status || ':' || (ended_at is not null)::text from public.passport_relationships_legacy where from_id = mem and to_id = o1) = 'ended:true', 'a removed member reads as ended, with a date');

  -- RLS of the source tables still decides visibility (security_invoker)
  perform passport_test.as_user(x);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_relationships_legacy where to_id = %L and relation = ''owns''', o1)) = 0, 'a stranger cannot read org ownership through the view');
  perform passport_test.as_user(g);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_relationships_legacy where from_id = %L and relation = ''attended''', g)) = 1, 'a person sees their own attendance');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_relationships_legacy where from_id = %L and relation = ''participates_in'' and status = ''pending''', g)) = 1, 'registered activity participation projects as pending');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_relationships_legacy where from_id = %L and relation = ''connected_with'' and status = ''active''', g)) = 1, 'accepted connection projects as active');
  perform passport_test.reset();

  -- a block is never a relationship
  update public.connections set status = 'blocked' where requester_id = g;
  perform passport_test.as_user(g);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_relationships_legacy where from_id = %L and relation = ''connected_with''', g)) = 0, 'a blocked connection is excluded from relationships');
  perform passport_test.as_anon();
  perform passport_test.raises('select * from public.passport_relationships_legacy', 'anon cannot read the relationship view');
  perform passport_test.reset();
end $$;

-- ── 7. structural hygiene ───────────────────────────────────────────────
do $$
begin
  perform passport_test.check_true(not exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'passport\_%' and not rowsecurity), 'every passport_* table has RLS enabled');
  perform passport_test.check_true(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'passport\_%' or p.proname like '\_passport\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'every passport SECURITY DEFINER function pins search_path');
  perform passport_test.check_true(not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'passport_relationships_legacy' and c.relkind = 'v'
      and not coalesce((select 'security_invoker=true' = any (c.reloptions)), false)), 'the legacy relationship view is security_invoker');
end $$;

rollback;
select 'passport_v2_consent_relationships: all assertions passed' as result;
