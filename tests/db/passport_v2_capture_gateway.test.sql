-- Passport V2: capture requests + Integration Gateway (service_role RPCs).
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)

-- S subject person · T other person · OWN org owner · REQ data_requester for the org
-- MEM org admin-ROLE member · ADM platform admin · HOST activity host
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 's@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 't@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'own@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 'req@test.local'),
  ('e0000000-0000-4000-8000-000000000005', 'mem@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'adm@test.local'),
  ('f1000000-0000-4000-8000-000000000007', 'host@test.local');
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Org One');
insert into public.organization_members (organization_id, profile_id, role, status) values ('01000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005', 'admin', 'active');
insert into public.admins (profile_id, role, active) values ('f0000000-0000-4000-8000-000000000006', 'admin', true);

-- ── 1. creating a capture request (Flow side) ───────────────────────────
do $$
declare r jsonb; r2 jsonb; s uuid := 'a0000000-0000-4000-8000-000000000001'; t uuid := 'b0000000-0000-4000-8000-000000000002';
        host uuid := 'f1000000-0000-4000-8000-000000000007'; act uuid := 'aa000000-0000-4000-8000-0000000000aa';
begin
  perform passport_test.as_user(t);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001'), 'not_authorized', 'a stranger cannot start a capture about someone else');
  perform passport_test.as_user(s);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'made_up', 'photo', 'idem-key-0001'), 'invalid_request', 'purpose validated');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'signed_record', 'idem-key-0001'), 'invalid_request', 'Capture can only produce photo/video/audio/document');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'short'), 'invalid_idempotency_key', 'idempotency key required and bounded');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', null, '{}', 'required'), 'invalid_request', 'location can only be forbidden or optional, never required');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', null, '{}', 'forbidden', 'forbidden', null, 5000), 'invalid_ttl', 'lifetime is bounded');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', null, array['Bad Key']), 'invalid_request', 'required_metadata keys validated');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', gen_random_uuid(), '{}', 'forbidden', 'forbidden', null, 72, 'work_item'), 'related_not_supported', 'work_item has no backing table — refused, not faked');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', act, '{}', 'forbidden', 'forbidden', null, 72, 'activity'), 'related_not_supported', 'cannot reference an activity the subject did not take part in');
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', act, '{}', 'forbidden', 'forbidden', null, 72, null), 'invalid_related', 'related is a pair');
  perform passport_test.denied(public.passport_create_capture_request('vehicle', gen_random_uuid(), 'skill_evidence', 'photo', 'idem-key-0001'), 'not_authorized', 'vehicles have no ownership resolver — cannot originate a capture');

  r := public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001', null, array['captured_at'], 'forbidden', 'forbidden', null, 72, null);
  perform passport_test.ok(r, 'the subject starts a capture of their own evidence');
  perform passport_test.check_true((r ->> 'duplicate')::boolean is false, 'created');
  r2 := public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0001');
  perform passport_test.check_true((r2 ->> 'id') = (r ->> 'id') and (r2 ->> 'duplicate')::boolean, 'same requester + key returns the same request (idempotent create)');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_capture_requests) = 1, 'exactly one request exists');
  perform passport_test.check_true((select consent_basis || ':' || status from public.passport_capture_requests) = 'subject_initiated:requested', 'subject-initiated, requested');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'capture.requested') = 1, 'capture.requested audited');

  -- related: a person who actually completed an activity can reference it
  insert into public.activities (id, created_by, title, activity_type, status) values (act, host, 'Workshop', 'workshop', 'published');
  perform passport_test.as_user(s);
  insert into public.activity_participants (activity_id, profile_id) values (act, s);
  perform passport_test.as_user(host);
  perform passport_test.ok(public.check_in_activity_participant(act, s), 'host checks in');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_create_capture_request('person', s, 'activity_outcome', 'photo', 'idem-key-0002', act, '{}', 'forbidden', 'forbidden', null, 72, 'activity'), 'a real participant can reference their activity');
  perform passport_test.reset();
end $$;

-- ── 2. consent-based capture requests ───────────────────────────────────
do $$
declare r jsonb; g uuid; s uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'c0000000-0000-4000-8000-000000000003';
        req uuid := 'd0000000-0000-4000-8000-000000000004'; mem uuid := 'e0000000-0000-4000-8000-000000000005';
        t uuid := 'b0000000-0000-4000-8000-000000000002'; o1 uuid := '01000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['capture_request'], '{}', now() + interval '30 days'), 'owner scopes a data_requester to capture_request');
  perform passport_test.as_user(req);
  r := public.passport_request_consent(s, 'organization', o1, 'capture_request', array['evidence_artifacts']);
  perform passport_test.ok(r, 'org asks the subject for capture consent'); g := (r ->> 'id')::uuid;

  -- not yet granted
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0010', null, '{}', 'forbidden', 'forbidden', g), 'not_authorized', 'a merely REQUESTED grant is not consent');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_respond_consent(g, true, null, now() + interval '30 days'), 'subject grants evidence_artifacts');
  perform passport_test.as_user(mem);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0011', null, '{}', 'forbidden', 'forbidden', g), 'not_authorized', 'an org admin-ROLE member cannot use the org''s grant');
  perform passport_test.as_user(t);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0012', null, '{}', 'forbidden', 'forbidden', g), 'not_authorized', 'a stranger cannot use it');

  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0013', null, '{}', 'optional', 'forbidden', g), 'consent_scope_insufficient', 'location was not approved, so location capture cannot be requested');
  perform passport_test.denied(public.passport_create_capture_request('person', t, 'work_completion', 'photo', 'idem-key-0014', null, '{}', 'forbidden', 'forbidden', g), 'not_authorized', 'a grant about S cannot be used for T');
  r := public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0015', null, '{}', 'forbidden', 'forbidden', g);
  perform passport_test.ok(r, 'the authorized requester, with consent covering exactly this, may request');
  perform passport_test.reset();
  perform passport_test.check_true((select consent_basis || ':' || requester_type from public.passport_capture_requests where idempotency_key = 'idem-key-0015') = 'consent_grant:organization', 'recorded with its consent basis and the requesting org');

  -- once the grantor revokes, no new requests
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_consent(g), 'subject revokes');
  perform passport_test.as_user(req);
  perform passport_test.denied(public.passport_create_capture_request('person', s, 'work_completion', 'photo', 'idem-key-0016', null, '{}', 'forbidden', 'forbidden', g), 'not_authorized', 'a revoked grant authorizes nothing');
  perform passport_test.reset();
end $$;

-- ── 3. RLS on requests ──────────────────────────────────────────────────
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; t uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'd0000000-0000-4000-8000-000000000004'; adm uuid := 'f0000000-0000-4000-8000-000000000006';
        mem uuid := 'e0000000-0000-4000-8000-000000000005';
begin
  perform passport_test.as_user(s);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') >= 2, 'the subject sees requests about them');
  perform passport_test.as_user(req);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') = 1, 'the requester sees only the request they made');
  perform passport_test.as_user(mem);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') = 0, 'org admin-role member sees none');
  perform passport_test.as_user(t);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') = 0, 'a stranger sees none');
  perform passport_test.as_anon();
  perform passport_test.raises('select * from public.passport_capture_requests', 'anon has no privilege');
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') = 0, 'admin at AAL1 sees none');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_capture_requests') >= 3, 'admin at AAL2 can audit');
  perform passport_test.as_user(s);
  perform passport_test.raises('insert into public.passport_capture_requests (subject_type, subject_id, requester_type, requester_id, purpose, evidence_type, consent_basis, expires_at, idempotency_key) values (''person'', gen_random_uuid(), ''person'', gen_random_uuid(), ''skill_evidence'', ''photo'', ''subject_initiated'', now(), ''idem-key-9999'')', 'a client cannot forge a capture request');
  perform passport_test.raises('update public.passport_capture_requests set status = ''completed''', 'a client cannot mark a request completed');
  perform passport_test.reset();
end $$;

-- ── 4. gateway functions are service_role ONLY ──────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'select public.passport_gateway_consume_nonce(''flow_capture'', ''0123456789abcdef0123'')',
    'select public.passport_gateway_get_capture_request(gen_random_uuid())',
    'select public.passport_gateway_report_capture_status(''flow_capture'', ''{}''::jsonb, repeat(''a'', 64))',
    'select public.passport_gateway_ingest_evidence_package(''flow_capture'', ''{}''::jsonb, repeat(''a'', 64))',
    'select public.passport_gateway_get_evidence_summary(''flow_capture'', gen_random_uuid())',
    'select public.passport_gateway_record_connection_result(''flow_capture'', true)'] loop
    perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
    perform passport_test.raises(fn, 'authenticated cannot call ' || fn);
    perform passport_test.as_anon();
    perform passport_test.raises(fn, 'anon cannot call ' || fn);
    perform passport_test.reset();
  end loop;
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  perform passport_test.raises('select * from public.passport_gateway_receipts', 'authenticated cannot read receipts');
  perform passport_test.raises('select * from public.passport_gateway_nonces', 'authenticated cannot read nonces');
  perform passport_test.raises('insert into public.passport_gateway_nonces values (''flow_capture'', ''0123456789abcdef0123'', now())', 'authenticated cannot write nonces');
  perform passport_test.reset();
end $$;

-- ── 5. replay protection ────────────────────────────────────────────────
do $$
begin
  perform passport_test.as_service();
  perform passport_test.check_true(public.passport_gateway_consume_nonce('flow_capture', 'nonce-aaaaaaaaaaaaaaaa') is true, 'first use of a nonce is accepted');
  perform passport_test.check_true(public.passport_gateway_consume_nonce('flow_capture', 'nonce-aaaaaaaaaaaaaaaa') is false, 'replaying the same nonce is refused');
  perform passport_test.check_true(public.passport_gateway_consume_nonce('other_client', 'nonce-aaaaaaaaaaaaaaaa') is true, 'nonces are per client');
  perform passport_test.reset();
  update public.passport_gateway_nonces set expires_at = now() - interval '1 hour' where client_id = 'flow_capture';
  perform passport_test.as_service();
  perform passport_test.check_true(public.passport_gateway_consume_nonce('flow_capture', 'nonce-aaaaaaaaaaaaaaaa') is true, 'an expired nonce is pruned, so the table cannot grow without bound');
  perform passport_test.reset();
end $$;

-- ── 6. reading a request + reporting status (Capture side) ──────────────
do $$
declare r jsonb; rid uuid; s uuid := 'a0000000-0000-4000-8000-000000000001'; sha text := repeat('a', 64); sha2 text := repeat('b', 64);
begin
  select id into rid from public.passport_capture_requests where idempotency_key = 'idem-key-0001';
  perform passport_test.as_service();
  r := public.passport_gateway_get_capture_request(rid);
  perform passport_test.ok(r, 'Capture can read the request');
  perform passport_test.check_true((select array_agg(k order by k collate "C") from jsonb_object_keys(r -> 'request') k) = (select array_agg(x order by x collate "C") from unnest(array['capture_session_id','consent_context','correlation_id','created_at','evidence_type','expires_at','idempotency_key','location_policy','operator_identity_policy','purpose','related','request_id','required_metadata','requester','schema_version','status','subject','updated_at']) x), 'the wire shape matches the CaptureRequest contract exactly');
  perform passport_test.check_true((r -> 'request' ->> 'schema_version') = '1.0', 'versioned');
  perform passport_test.denied(public.passport_gateway_get_capture_request(gen_random_uuid()), 'unknown_capture_request', 'unknown request');

  perform passport_test.ok(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid, 'status', 'accepted', 'idempotency_key', 'rep-key-0001', 'occurred_at', now()), sha), 'Capture reports accepted');
  r := public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid, 'status', 'accepted', 'idempotency_key', 'rep-key-0001', 'occurred_at', now()), sha);
  perform passport_test.check_true((r ->> 'duplicate')::boolean, 'a retried report is a no-op duplicate');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid, 'status', 'started', 'capture_session_id', 'sess-1', 'idempotency_key', 'rep-key-0001'), sha2), 'idempotency_conflict', 'same key, different body is a conflict, not an overwrite');
  perform passport_test.ok(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid, 'status', 'started', 'capture_session_id', 'sess-1', 'idempotency_key', 'rep-key-0002'), sha2), 'Capture reports started with its session');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid, 'status', 'accepted', 'idempotency_key', 'rep-key-0003'), repeat('c', 64)), 'invalid_transition', 'started cannot go back to accepted');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', gen_random_uuid(), 'status', 'accepted', 'idempotency_key', 'rep-key-0004'), repeat('d', 64)), 'unknown_capture_request', 'unknown request');
  perform passport_test.reset();
  perform passport_test.check_true((select status || ':' || capture_session_id from public.passport_capture_requests where id = rid) = 'started:sess-1', 'lifecycle reflects what Capture reported');
  perform passport_test.check_true((select array_agg(event_type order by seq) from public.passport_events where refs ->> 'capture_request_id' = rid::text and event_type in ('capture.accepted','capture.started')) = array['capture.accepted','capture.started'], 'lifecycle events audited exactly once each (the duplicate wrote nothing)');
end $$;

-- ── 7. the evidence package: every rule ─────────────────────────────────
create function pg_temp.pkg(req uuid, subj uuid, pid text, idem text, extra jsonb default '{}', kind text default 'photo', provider text default 'flow_capture', refv text default 'capture://s/1')
returns jsonb language sql as $$
  select jsonb_build_object(
    'schema_version', '1.0', 'package_id', pid, 'producer', 'flow_capture', 'capture_request_id', req,
    'subject', jsonb_build_object('type', 'person', 'id', subj), 'capture_session_id', 'sess-1', 'captured_at', now(),
    'artifacts', jsonb_build_array(jsonb_build_object('artifact_id', 'art-1', 'kind', kind, 'media_type', 'image/jpeg', 'storage', jsonb_build_object('provider', provider, 'ref', refv))),
    'source_metadata', jsonb_build_object('captured_at', 'yes'),
    'provenance', jsonb_build_object('producer_version', '0.1.0', 'capture_method', 'in_app_camera'),
    'correlation_id', 'corr-1', 'idempotency_key', idem) || extra;
$$;

do $$
declare r jsonb; rid uuid; s uuid := 'a0000000-0000-4000-8000-000000000001'; t uuid := 'b0000000-0000-4000-8000-000000000002';
        p jsonb; sha text := repeat('1', 64); sha2 text := repeat('2', 64); ev uuid; claims_before bigint; events_before bigint;
        pid1 text := '11111111-1111-4111-8111-111111111111';
begin
  select id into rid from public.passport_capture_requests where idempotency_key = 'idem-key-0001';
  select count(*) into claims_before from public.passport_claims;
  perform passport_test.as_service();

  -- invalid-schema / policy rejections leave no trace
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(gen_random_uuid(), s, pid1, 'pkg-idem-0001'), sha), 'unknown_capture_request', 'unknown capture request');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, t, pid1, 'pkg-idem-0002'), sha), 'subject_mismatch', 'evidence for a different subject is refused');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0003', jsonb_build_object('location', jsonb_build_object('lat', 42.88, 'lng', -78.87))), sha), 'location_not_permitted', 'location is refused when the request forbids it');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0004', jsonb_build_object('operator', jsonb_build_object('type', 'person', 'id', 'op-1'))), sha), 'operator_not_permitted', 'operator identity is refused when the request forbids it');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0005', jsonb_build_object('source_metadata', '{}'::jsonb)), sha), 'metadata_missing', 'required metadata must be present');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0006', '{}', 'photo', 'external', 'https://elsewhere/x.jpg'), sha), 'invalid_schema', 'artifacts must be Capture-hosted references');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0007', '{}', 'photo', 'flow_capture', 'data:image/png;base64,AAAA'), sha), 'invalid_schema', 'inline blobs are refused');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, pid1, 'pkg-idem-0008', '{}', 'video'), sha), 'invalid_schema', 'artifact kind must match the requested evidence type');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_evidence where producer = 'flow_capture') = 0, 'rejected packages created no evidence');
  perform passport_test.check_true((select status from public.passport_capture_requests where id = rid) = 'started', 'rejected packages did not complete the request');

  -- the valid submission
  perform passport_test.as_service();
  p := pg_temp.pkg(rid, s, pid1, 'pkg-idem-0100');
  r := public.passport_gateway_ingest_evidence_package('flow_capture', p, sha);
  perform passport_test.ok(r, 'a valid package is accepted');
  perform passport_test.check_true((r ->> 'duplicate')::boolean is false, 'first delivery is not a duplicate');
  ev := (r ->> 'evidence_id')::uuid;
  perform passport_test.reset();

  -- EVIDENCE != VERIFIED CLAIM
  perform passport_test.check_true((select count(*) from public.passport_claims) = claims_before, 'receiving evidence created NO claim');
  perform passport_test.check_true((select count(*) from public.passport_verifications where claim_id in (select claim_id from public.passport_claim_evidence where evidence_id = ev)) = 0, 'receiving evidence recorded NO verification');
  perform passport_test.check_true((select status || ':' || source_kind || ':' || producer || ':' || sensitivity from public.passport_evidence where id = ev) = 'received:capture:flow_capture:standard', 'evidence is received (not accepted/verified), sourced from capture');
  perform passport_test.check_true((select capture_request_id from public.passport_evidence where id = ev) = rid, 'linked to the request it answered');
  perform passport_test.check_true((select status from public.passport_capture_requests where id = rid) = 'completed', 'the request is completed');
  perform passport_test.check_true((select array_agg(event_type order by seq) from public.passport_events where refs ->> 'capture_request_id' = rid::text and event_type in ('evidence.created','capture.completed')) = array['evidence.created','capture.completed'], 'evidence.created + capture.completed audited');
  perform passport_test.check_true((select actor_type || ':' || actor_id from public.passport_events where event_type = 'capture.completed' and refs ->> 'capture_request_id' = rid::text) = 'service:flow_capture', 'the actor is the authenticated service, not a person');
  select count(*) into events_before from public.passport_events;

  -- DUPLICATE DELIVERY
  perform passport_test.as_service();
  r := public.passport_gateway_ingest_evidence_package('flow_capture', p, sha);
  perform passport_test.ok(r, 'a retried delivery succeeds');
  perform passport_test.check_true((r ->> 'duplicate')::boolean and (r ->> 'evidence_id')::uuid = ev, 'and returns the SAME evidence, flagged duplicate');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', p, sha2), 'idempotency_conflict', 'same key + different body is a conflict, never an overwrite');
  -- the same package re-sent under a NEW key (e.g. a client bug) still cannot create a second record
  r := public.passport_gateway_ingest_evidence_package('flow_capture', p || '{"idempotency_key":"pkg-idem-0999"}', sha);
  perform passport_test.check_true((r ->> 'duplicate')::boolean and (r ->> 'evidence_id')::uuid = ev, 'same package_id + same content under a new key is still one record');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', p || '{"idempotency_key":"pkg-idem-0998"}', sha2), 'idempotency_conflict', 'same package_id with different content is refused');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_evidence where producer = 'flow_capture') = 1, 'still exactly one evidence record');
  perform passport_test.check_true((select count(*) from public.passport_events) = events_before, 'duplicates wrote no further audit events');

  -- a completed request cannot take a second package
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, '22222222-2222-4222-8222-222222222222', 'pkg-idem-0200'), repeat('3', 64)), 'request_not_open', 'a completed request is closed');
  perform passport_test.reset();

  -- the subject can read their evidence; nobody else can
  perform passport_test.as_user(s);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_evidence where id = %L', ev)) = 1, 'the subject sees the evidence delivered about them');
  perform passport_test.as_user(t);
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_evidence where id = %L', ev)) = 0, 'a stranger does not');
  perform passport_test.reset();
end $$;

-- policy-permitted extras, expiry, cancellation, failure
do $$
declare r jsonb; rid uuid; rid2 uuid; rid3 uuid; s uuid := 'a0000000-0000-4000-8000-000000000001'; ev uuid;
begin
  perform passport_test.as_user(s);
  rid := (public.passport_create_capture_request('person', s, 'credential_document', 'document', 'idem-key-0300', null, '{}', 'optional', 'optional', null, 24) ->> 'id')::uuid;
  perform passport_test.reset();
  perform passport_test.as_service();
  r := public.passport_gateway_ingest_evidence_package('flow_capture',
        pg_temp.pkg(rid, s, '33333333-3333-4333-8333-333333333333', 'pkg-idem-0300',
          jsonb_build_object('location', jsonb_build_object('lat', 42.88, 'lng', -78.87), 'operator', jsonb_build_object('type', 'person', 'id', 'op-1')), 'document'), repeat('4', 64));
  perform passport_test.ok(r, 'location and operator are accepted when the request explicitly permits them');
  ev := (r ->> 'evidence_id')::uuid;
  perform passport_test.reset();
  perform passport_test.check_true((select sensitivity from public.passport_evidence where id = ev) = 'sensitive', 'credential documents and location-bearing evidence are stored as sensitive');
  perform passport_test.check_true((select provenance ? 'location' and provenance ? 'operator' from public.passport_evidence where id = ev), 'permitted extras are kept in provenance');

  -- expiry: a request past its window refuses evidence and flips to expired
  perform passport_test.as_user(s);
  rid2 := (public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0301', null, '{}', 'forbidden', 'forbidden', null, 1) ->> 'id')::uuid;
  perform passport_test.reset();
  alter table public.passport_capture_requests disable trigger passport_capture_guard_trg;
  update public.passport_capture_requests set expires_at = now() - interval '1 minute' where id = rid2;   -- simulate time passing
  alter table public.passport_capture_requests enable trigger passport_capture_guard_trg;
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid2, s, '44444444-4444-4444-8444-444444444444', 'pkg-idem-0301', '{"source_metadata":{"captured_at":"x"}}'), repeat('5', 64)), 'request_expired', 'an expired request refuses evidence');
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid2, s, '44444444-4444-4444-8444-444444444445', 'pkg-idem-0302'), repeat('6', 64)), 'request_expired', 'and stays expired');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid2, 'status', 'started', 'capture_session_id', 's', 'idempotency_key', 'rep-key-0301'), repeat('7', 64)), 'request_expired', 'expired requests take no status reports either');
  r := public.passport_gateway_get_capture_request(rid2);
  perform passport_test.check_true((r -> 'request' ->> 'status') = 'expired', 'reading an overdue request reports it as expired');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'capture.expired' and refs ->> 'capture_request_id' = rid2::text) = 1, 'capture.expired audited exactly once');

  -- cancellation by the subject; failure reported by Capture
  perform passport_test.as_user(s);
  rid3 := (public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0302', null, '{}', 'forbidden', 'forbidden', null, 24) ->> 'id')::uuid;
  perform passport_test.ok(public.passport_cancel_capture_request(rid3), 'the subject cancels');
  perform passport_test.denied(public.passport_cancel_capture_request(rid3), 'not_open', 'cannot cancel twice');
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid3, s, '55555555-5555-4555-8555-555555555555', 'pkg-idem-0303', '{"source_metadata":{"captured_at":"x"}}'), repeat('8', 64)), 'request_not_open', 'a cancelled request refuses evidence');
  perform passport_test.reset();
  perform passport_test.as_user(s);
  rid3 := (public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'idem-key-0303', null, '{}', 'forbidden', 'forbidden', null, 24) ->> 'id')::uuid;
  perform passport_test.as_service();
  perform passport_test.ok(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid3, 'status', 'failed', 'reason_code', 'device_error', 'idempotency_key', 'rep-key-0400'), repeat('9', 64)), 'Capture reports a failure');
  perform passport_test.denied(public.passport_gateway_report_capture_status('flow_capture', jsonb_build_object('request_id', rid3, 'status', 'started', 'capture_session_id', 's', 'idempotency_key', 'rep-key-0401'), repeat('0', 64)), 'request_not_open', 'a failed request is closed');
  perform passport_test.reset();
  perform passport_test.check_true((select status || ':' || failure_reason from public.passport_capture_requests where id = rid3) = 'failed:device_error', 'failure recorded with its reason');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'capture.failed') = 1, 'capture.failed audited');
end $$;

-- evidence readback is metadata-only and scoped to the producer's own deliveries
do $$
declare r jsonb; ev uuid;
begin
  select (result ->> 'evidence_id')::uuid into ev from public.passport_gateway_receipts where kind = 'evidence_package' order by created_at limit 1;
  perform passport_test.as_service();
  r := public.passport_gateway_get_evidence_summary('flow_capture', ev);
  perform passport_test.ok(r, 'Capture can read back a summary of evidence it delivered');
  perform passport_test.check_true((select array_agg(k order by k collate "C") from jsonb_object_keys(r -> 'summary') k) = (select array_agg(x order by x collate "C") from unnest(array['artifact_count','capture_request_id','captured_at','evidence_id','evidence_status','package_id','received_at','schema_version','subject']) x), 'summary shape matches the EvidenceSummary contract');
  perform passport_test.check_true(r::text not like '%capture://%' and r::text not like '%artifacts%', 'the summary never carries artifact references');
  perform passport_test.denied(public.passport_gateway_get_evidence_summary('some_other_client', ev), 'unknown_evidence', 'a different producer cannot read it');
  perform passport_test.denied(public.passport_gateway_get_evidence_summary('flow_capture', gen_random_uuid()), 'unknown_evidence', 'unknown evidence');
  perform passport_test.reset();
end $$;

-- ── 8. connection health ────────────────────────────────────────────────
do $$
declare r jsonb; adm uuid := 'f0000000-0000-4000-8000-000000000006'; s uuid := 'a0000000-0000-4000-8000-000000000001';
begin
  perform passport_test.as_service();
  perform passport_test.denied(public.passport_gateway_record_connection_result('flow_capture', false, 'made_up'), 'invalid_category', 'category validated');
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', true) ->> 'status') = 'healthy', 'success: healthy');
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', false, 'schema') ->> 'status') = 'error', 'authenticated schema failures put the connection in error');
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', false, 'network') ->> 'status') = 'degraded', 'a network failure is degraded');
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', false, 'auth') ->> 'status') = 'auth_required', 'an auth failure needs re-authorization');
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', true) ->> 'status') = 'healthy', 'recovery: healthy again');
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_integration_connections) = 1, 'one platform-level connection row');
  perform passport_test.check_true((select last_success_at is not null and last_error_category is null from public.passport_integration_connections), 'success clears the error and stamps last_success_at');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'integration.sync_failed') = 3, 'every failure audited');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'integration.connected') = 2, 'connected on first contact and again on recovery');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'integration.degraded') = 2, 'degraded on the healthy->error and error->degraded transitions');
  perform passport_test.check_true((select count(*) from public.passport_events where event_type = 'integration.disconnected') = 1, 'disconnected when re-authorization became needed');
  perform passport_test.check_true(not exists (select 1 from public.passport_events where event_type like 'integration.%' and subject_id is not null), 'platform-scope events carry no subject');

  -- who can see connection state
  perform passport_test.as_user(s);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 0, 'a normal user cannot see platform connections');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events where event_type like ''integration.%''') = 0, 'nor their health events');
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 0, 'admin at AAL1 cannot');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 1, 'admin at AAL2 can');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events where event_type like ''integration.%''') = 8, 'admin at AAL2 can read the health history');
  perform passport_test.raises('update public.passport_integration_connections set status = ''healthy''', 'no client can edit a connection');
  perform passport_test.reset();
end $$;

-- ── 9. structural hygiene ───────────────────────────────────────────────
do $$
begin
  perform passport_test.check_true(not exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'passport\_%' and not rowsecurity), 'every passport_* table has RLS enabled');
  perform passport_test.check_true(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and (p.proname like 'passport\_%' or p.proname like '\_passport\_%') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')), 'every passport SECURITY DEFINER function pins search_path');
  perform passport_test.check_true(not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public' and g.routine_name like 'passport\_gateway\_%' and g.grantee in ('anon', 'authenticated', 'PUBLIC')), 'no client role can execute any gateway function');
  perform passport_test.check_true(not exists (
    select 1 from information_schema.role_routine_grants g
    where g.routine_schema = 'public' and g.routine_name = '_passport_capture_request_json' and g.grantee in ('anon', 'authenticated', 'PUBLIC')), 'the wire-projection helper is internal');
end $$;

rollback;
select 'passport_v2_capture_gateway: all assertions passed' as result;
