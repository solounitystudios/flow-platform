-- Passport V2: independent-review regression suite.
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)
--
-- Two kinds of assertion, each with a CONTROL so it cannot pass on empty data or a broken fixture:
--   A. properties the review found BROKEN and fixed (migration 20260919120700): consent at the point of
--      use for capture requests, the capture_related_ok oracle, reportable statuses;
--   B. properties the review attacked and found HOLDING, now pinned: ledger/provenance immutability
--      against service_role, no client writes, self-verification, authority self-assignment,
--      selective-disclosure consent at the point of use, relationship impersonation.
-- Known-open findings (need a policy/schema decision) are NOT asserted here; see
-- tests/db/repros/passport_v2_review_attacks.repro.sql for their reproductions.
--
-- S subject · X stranger · OWN owner of Org One · REQ requester principal · HOST activity host

create function pg_temp.pkg(req uuid, subj uuid, pid text, idem text)
returns jsonb language sql as $$
  select jsonb_build_object(
    'schema_version', '1.0', 'package_id', pid, 'producer', 'flow_capture', 'capture_request_id', req,
    'subject', jsonb_build_object('type', 'person', 'id', subj), 'capture_session_id', 'sess-1', 'captured_at', now(),
    'artifacts', jsonb_build_array(jsonb_build_object('artifact_id', 'art-1', 'kind', 'photo', 'media_type', 'image/jpeg', 'storage', jsonb_build_object('provider', 'flow_capture', 'ref', 'capture://s/1'))),
    'source_metadata', '{}'::jsonb, 'provenance', jsonb_build_object('producer_version', '0.1.0'),
    'correlation_id', 'corr-1', 'idempotency_key', idem);
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 's@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'x@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'own@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 'req@test.local'),
  ('f1000000-0000-4000-8000-000000000007', 'host@test.local');
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Org One');

-- ── A1. consent is evaluated where it is USED (capture requests) ─────────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'c0000000-0000-4000-8000-000000000003'; req uuid := 'd0000000-0000-4000-8000-000000000004';
        o1 uuid := '01000000-0000-4000-8000-000000000001'; r jsonb; g uuid; g2 uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; ev_before bigint; ing jsonb;
begin
  -- setup: REQ is a capture_request data_requester for Org One; S grants two consents
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['capture_request'], '{}', now() + interval '30 days'), 'setup: requester authority');
  perform passport_test.as_user(req);
  g := ((public.passport_request_consent(s, 'organization', o1, 'capture_request', array['evidence_artifacts'])) ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_respond_consent(g, true, null, now() + interval '30 days'), 'setup: consent 1 approved');
  perform passport_test.as_user(req);
  r1 := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'consent-req-0001', null, '{}', 'forbidden', 'forbidden', g, 72, null)) ->> 'id')::uuid;
  r2 := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'consent-req-0002', null, '{}', 'forbidden', 'forbidden', g, 72, null)) ->> 'id')::uuid;
  perform passport_test.as_user(s);
  -- a subject-initiated request: NOT resting on consent, so it must survive any consent revocation (over-cancellation control)
  r3 := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'subject-req-0001')) ->> 'id')::uuid;
  perform passport_test.check_true(r1 is not null and r2 is not null and r3 is not null, 'setup: three open requests');

  -- CONTROL: while consent is live the gateway path works end to end
  perform passport_test.as_service();
  perform passport_test.ok(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', r1, 'status', 'accepted', 'idempotency_key', 'ctl-status-0001'), repeat('1', 64)), 'CONTROL: a live-consent request can be accepted by the connector');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r1) = 'accepted', 'CONTROL: it advanced');

  -- the subject REVOKES consent
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_consent(g, 'changed my mind'), 'subject revokes');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r1) = 'cancelled', 'R05: the accepted request is cancelled by the revocation');
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r2) = 'cancelled', 'R05: the untouched request is cancelled too');
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r3) = 'requested', 'CONTROL: a subject-initiated request is NOT cancelled by revoking a consent');
  perform passport_test.check_true(exists (select 1 from public.passport_events where event_type = 'capture.cancelled' and refs ->> 'capture_request_id' = r1::text and payload ->> 'cause' = 'consent_no_longer_active'), 'the cancellation is audited with its reason');

  -- the connector keeps trying: nothing is served or recorded
  select count(*) into ev_before from public.passport_evidence;
  perform passport_test.as_service();
  perform passport_test.check_true((public.passport_gateway_get_capture_request(r2) -> 'request' ->> 'status') = 'cancelled', 'the connector is TOLD the request is cancelled');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(r2, s, '11111111-1111-4111-8111-111111111111', 'pkg-idem-0001'), repeat('2', 64)), 'request_not_open', 'R05: evidence cannot be delivered under a revoked consent');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', r2, 'status', 'started', 'idempotency_key', 'post-revoke-0001'), repeat('3', 64)), 'request_not_open', 'R05: status cannot advance under a revoked consent');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_evidence) = ev_before, 'R05: no evidence was recorded');

  -- the subject-initiated request still works (control that the fix did not break the normal path)
  perform passport_test.as_service();
  ing := public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(r3, s, '22222222-2222-4222-8222-222222222222', 'pkg-idem-0002'), repeat('4', 64));
  perform passport_test.ok(ing, 'CONTROL: a subject-initiated request still accepts evidence');
  perform passport_test.reset();

  -- consent that EXPIRES BY TIME (no sweep has run) is also not honoured at the point of use
  perform passport_test.as_user(req);
  g2 := ((public.passport_request_consent(s, 'organization', o1, 'capture_request', array['evidence_artifacts'])) ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_respond_consent(g2, true, null, now() + interval '30 days'), 'setup: consent 2 approved');
  perform passport_test.as_user(req);
  r4 := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'consent-req-0004', null, '{}', 'forbidden', 'forbidden', g2, 72, null)) ->> 'id')::uuid;
  r5 := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'consent-req-0005', null, '{}', 'forbidden', 'forbidden', g2, 72, null)) ->> 'id')::uuid;
  perform passport_test.reset();
  alter table public.passport_consent_grants disable trigger user;
  update public.passport_consent_grants set expires_at = now() - interval '1 minute' where id = g2;
  alter table public.passport_consent_grants enable trigger user;
  perform passport_test.check_true((select status from public.passport_consent_grants where id = g2) = 'active', 'setup: grant is past expires_at yet still marked active (never swept)');
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(r4, s, '33333333-3333-4333-8333-333333333333', 'pkg-idem-0003'), repeat('5', 64)), 'request_not_open', 'R05: a time-expired consent is not honoured either');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r4) = 'cancelled', 'and the request was cancelled lazily, at the point of use');

  -- the STATUS-REPORT path re-evaluates consent too (r5 was opened under the same, now silently-expired, grant)
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r5) = 'requested', 'setup: r5 is still open although its consent is past expiry');
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', r5, 'status', 'started', 'idempotency_key', 'exp-status-0001'), repeat('a', 64)), 'request_not_open', 'R05: a status report under a time-expired consent is refused');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = r5) = 'cancelled', 'and the request was cancelled at the point of use');
end $$;

-- ── A2. the gateway can only report accepted | started | failed ──────────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; rid uuid;
begin
  perform passport_test.as_user(s);
  rid := ((public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'status-req-0001')) ->> 'id')::uuid;
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', rid, 'status', 'completed', 'idempotency_key', 'rs-completed-01'), repeat('6', 64)), 'invalid_transition', 'R06c: a producer cannot mark a request completed without delivering evidence');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', rid, 'status', 'cancelled', 'idempotency_key', 'rs-cancelled-01'), repeat('7', 64)), 'invalid_transition', 'R06c: nor cancel');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', rid, 'status', 'expired', 'idempotency_key', 'rs-expired-001'), repeat('8', 64)), 'invalid_transition', 'R06c: nor expire');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = rid) = 'requested', 'the request is untouched by the refused reports');
  perform passport_test.as_service();
  perform passport_test.ok(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('schema_version', '1.0', 'request_id', rid, 'status', 'started', 'idempotency_key', 'rs-started-001'), repeat('9', 64)), 'CONTROL: started is still accepted');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_capture_requests where id = rid) = 'started', 'CONTROL: and it advanced');
end $$;

-- ── A3. least privilege: the participation oracle ────────────────────────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002'; host uuid := 'f1000000-0000-4000-8000-000000000007';
        act uuid := 'aa000000-0000-4000-8000-0000000000aa'; r jsonb;
begin
  insert into public.activities (id, created_by, title, activity_type, status) values (act, host, 'Workshop', 'workshop', 'published');
  perform passport_test.as_user(s);
  insert into public.activity_participants (activity_id, profile_id) values (act, s);
  perform passport_test.as_user(host);
  perform passport_test.ok(public.check_in_activity_participant(act, s), 'setup: S attended');
  perform passport_test.reset();
  -- the truth the oracle would have leaked exists...
  perform passport_test.check_true(public.passport_capture_related_ok(s, 'activity', act), 'CONTROL: (as owner/definer) S really did attend');
  -- ...and a stranger can no longer ask
  perform passport_test.as_user(x);
  perform passport_test.raises(format('select public.passport_capture_related_ok(%L, ''activity'', %L)', s, act), 'R01: a stranger cannot probe another person''s participation');
  -- the legitimate path that USES the oracle internally still works for the subject
  perform passport_test.as_user(s);
  r := public.passport_create_capture_request('person', s, 'activity_outcome', 'photo', 'related-req-0001', act, '{}', 'forbidden', 'forbidden', null, 72, 'activity');
  perform passport_test.ok(r, 'CONTROL: a real participant can still reference their activity (the definer RPC is unaffected)');
  perform passport_test.reset();
end $$;

-- ── B1. even service_role cannot rewrite history, provenance or decisions ─
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; sub uuid; blocked int := 0;
begin
  -- rows that the guards protect must EXIST, or "blocked" would prove nothing
  perform passport_test.as_user(s);
  sub := ((public.passport_create_claim('person', s, 'skill.welding', '{}', 'private', 'standard', null, null, true)) ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events) > 0, 'CONTROL: events exist');
  perform passport_test.check_true((select count(*) from public.passport_evidence) > 0, 'CONTROL: evidence exists');
  perform passport_test.check_true((select count(*) from public.passport_consent_grants) > 0, 'CONTROL: consent grants exist');
  perform passport_test.check_true((select count(*) from public.passport_gateway_receipts) > 0, 'CONTROL: receipts exist');
  perform passport_test.check_true((select status from public.passport_claims where id = sub) = 'submitted', 'CONTROL: a genuinely unverified claim exists');
  perform passport_test.as_service();
  perform passport_test.raises('delete from public.passport_events', 'service_role cannot delete ledger rows');
  perform passport_test.raises('update public.passport_events set event_type = ''x.y''', 'service_role cannot edit ledger rows');
  perform passport_test.raises('truncate public.passport_events', 'service_role cannot truncate the ledger');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', sub), 'service_role cannot flip a claim to verified without a recorded decision');
  perform passport_test.raises('update public.passport_evidence set provenance = ''{"forged":true}''::jsonb', 'service_role cannot rewrite evidence provenance');
  perform passport_test.raises('update public.passport_evidence set artifacts = ''[]''::jsonb', 'service_role cannot rewrite evidence artifacts');
  perform passport_test.raises('update public.passport_consent_grants set status = ''active''', 'service_role cannot un-revoke a consent grant');
  perform passport_test.raises('update public.passport_gateway_receipts set result = ''{}''::jsonb', 'service_role cannot rewrite idempotency receipts');
  perform passport_test.raises('delete from public.passport_claims', 'service_role cannot delete claims');
  perform passport_test.reset();
end $$;

-- ── B2. a subject cannot write ANY provenance/verification/authority/ledger table directly ─
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; o1 uuid := '01000000-0000-4000-8000-000000000001'; cl uuid;
begin
  select id into cl from public.passport_claims where subject_id = s limit 1;
  perform passport_test.check_true(cl is not null, 'CONTROL: a claim to attack exists');
  perform passport_test.as_user(s);
  perform passport_test.raises(format('update public.passport_claims set source_system = ''forged'' where id = %L', cl), 'subject cannot edit their claim''s source');
  perform passport_test.raises('update public.passport_evidence set provenance = ''{}''::jsonb', 'subject cannot edit evidence');
  perform passport_test.raises(format('insert into public.passport_verifications (claim_id, method, verifier_type, requested_by) values (%L, ''platform_verified'', ''system'', %L)', cl, s), 'subject cannot write a verification');
  perform passport_test.raises('delete from public.passport_events', 'subject cannot touch the ledger');
  perform passport_test.raises(format('insert into public.passport_authority_assignments (principal_id, entity_type, entity_id, authority_type, expires_at) values (%L, ''organization'', %L, ''credential_issuer'', now() + interval ''1 day'')', s, o1), 'subject cannot write authority');
  perform passport_test.reset();
end $$;

-- ── B3. self-verification and authority self-assignment ──────────────────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002'; o1 uuid := '01000000-0000-4000-8000-000000000001'; cl uuid; r jsonb;
begin
  select id into cl from public.passport_claims where subject_id = s and status = 'submitted' limit 1;
  perform passport_test.check_true(cl is not null, 'CONTROL: a reviewable claim exists');
  perform passport_test.as_user(s);
  perform passport_test.denied(public.passport_request_verification(cl, 'peer_attested', 'person', s), 'verifier_is_subject', 'a subject cannot name themselves as their peer verifier');
  perform passport_test.denied(public.passport_request_verification(cl, 'self_attested', 'person', s), 'method_cannot_verify', 'self_attested can never yield verified');
  perform passport_test.denied(public.passport_assign_authority(s, 'person', s, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'authority_entity_mismatch', 'owning your PERSON record does not let you assign yourself authority');
  perform passport_test.denied(public.passport_assign_authority(s, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'not_entity_owner', 'a non-owner cannot grant themselves authority on an org');
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_assign_authority(x, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'not_entity_owner', 'a stranger cannot either');
  -- CONTROL: the rightful org owner CAN assign, so the denials above are about ownership and not a broken RPC
  perform passport_test.as_user('c0000000-0000-4000-8000-000000000003');
  perform passport_test.ok(public.passport_assign_authority(x, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'CONTROL: the org owner can assign authority');
  perform passport_test.reset();
end $$;

-- ── B4. selective disclosure: consent evaluated at the point of use ──────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'c0000000-0000-4000-8000-000000000003'; x uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'd0000000-0000-4000-8000-000000000004'; o1 uuid := '01000000-0000-4000-8000-000000000001'; host uuid := 'f1000000-0000-4000-8000-000000000007';
        act uuid := 'aa000000-0000-4000-8000-0000000000aa'; g uuid; aid uuid; d jsonb;
begin
  -- a verified claim to be asked about (host completes S; S claims it)
  perform passport_test.as_user(host);
  perform passport_test.ok(public.complete_activity_participant(act, s), 'setup: host completes S');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_claim_from_activity(act), 'setup: S claims the outcome');
  -- REQ needs a SECOND, disclosure-purposed authority (event_entry); the first is capture_request-only
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_revoke_authority((select id from public.passport_authority_assignments where principal_id = req and status = 'active' limit 1), 'reset'), 'setup: reset');
  aid := ((public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['event_entry'], '{}', now() + interval '30 days')) ->> 'id')::uuid;
  perform passport_test.as_user(req);
  g := ((public.passport_request_consent(s, 'organization', o1, 'event_entry', array['attendance'])) ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_respond_consent(g, true, null, now() + interval '30 days'), 'setup: S consents to an attendance check');

  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform passport_test.check_true((d ->> 'ok')::boolean and (d ->> 'answer')::boolean, 'CONTROL: the grantee gets a real, positive answer under a live grant: ' || d::text);
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_disclose(g, 'claim_valid', 'participation.activity', null), 'not_found', 'a non-grantee cannot use the grant');
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_revoke_authority(aid, 'left the org'), 'setup: the grantee loses authority');
  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_disclose(g, 'claim_valid', 'participation.activity', null), 'not_found', 'stale authorization: a grant does not outlive the grantee''s authority');
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['event_entry'], '{}', now() + interval '30 days'), 'setup: authority restored');
  perform passport_test.as_user(req);
  perform passport_test.check_true((public.passport_disclose(g, 'claim_valid', 'participation.activity', null) ->> 'ok')::boolean, 'CONTROL: it works again once authority is restored');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_consent(g, 'no'), 'the subject revokes');
  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_disclose(g, 'claim_valid', 'participation.activity', null), 'not_active', 'a revoked grant cannot authorize disclosure');
  perform passport_test.reset();
end $$;

-- ── B5. relationships cannot be proposed on behalf of someone else ───────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002'; r jsonb;
begin
  perform passport_test.as_user(x);
  perform passport_test.denied(public.passport_propose_relationship('person', s, 'mentor_of', 'person', x, '{}'), 'not_authorized', 'a stranger cannot propose a relationship AS someone else');
  perform passport_test.as_user(s);
  r := public.passport_propose_relationship('person', s, 'mentor_of', 'person', x, '{}');
  perform passport_test.ok(r, 'CONTROL: the rightful party can propose');
  perform passport_test.reset();
end $$;

rollback;
select 'passport_v2_review_regression: all assertions passed' as result;
