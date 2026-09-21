-- Passport V2 independent review: adversarial reproductions.
-- NOT a *.test.sql file on purpose: replay.sh only runs tests/db/*.test.sql, so this never gates CI.
-- Run:   cat tests/db/_helpers.sql tests/db/repros/passport_v2_review_attacks.repro.sql | psql ... (see README.md)
-- Every probe prints "RESULT <id>: SECURE|VULNERABLE|INFO ...". VULNERABLE lines are reproduced findings.
-- Everything happens inside one transaction that is rolled back.

create function pg_temp.say(id text, verdict text, detail text default '') returns void language plpgsql as $$
begin raise notice 'RESULT %: % %', id, verdict, detail; end $$;

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

-- S subject · X stranger · OWN owner of Org One · S2 accomplice of S · HOST activity host · ADM platform admin
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 's@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'x@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'own@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 's2@test.local'),
  ('f1000000-0000-4000-8000-000000000007', 'host@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'adm@test.local');
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Org One');
insert into public.admins (profile_id, role, active) values ('f0000000-0000-4000-8000-000000000006', 'admin', true);
update public.profiles set public_passport = true where id = 'a0000000-0000-4000-8000-000000000001';

-- fixture: S completed a host-run activity (host-recorded outcome) and claimed it (verified, platform_verified)
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; host uuid := 'f1000000-0000-4000-8000-000000000007';
        act uuid := 'aa000000-0000-4000-8000-0000000000aa'; r jsonb;
begin
  insert into public.activities (id, created_by, title, activity_type, status) values (act, host, 'Welding workshop', 'workshop', 'published');
  perform passport_test.as_user(s);
  insert into public.activity_participants (activity_id, profile_id) values (act, s);
  perform passport_test.as_user(host);
  perform public.check_in_activity_participant(act, s);
  perform public.complete_activity_participant(act, s);
  perform passport_test.as_user(s);
  r := public.passport_claim_from_activity(act);
  perform passport_test.reset();
  create temp table fx as select (r ->> 'id')::uuid as claim_id, act as act_id;
  grant select on fx to public;
end $$;

-- ═══ R01: capture_related_ok as an arbitrary-subject participation oracle ═══
do $$
declare x uuid := 'b0000000-0000-4000-8000-000000000002'; s uuid := 'a0000000-0000-4000-8000-000000000001'; act uuid := (select act_id from fx); yes boolean; no boolean;
begin
  perform passport_test.as_user(x);
  yes := public.passport_capture_related_ok(s, 'activity', act);
  no := public.passport_capture_related_ok(x, 'activity', act);
  perform pg_temp.say('R01 capture_related_ok oracle (stranger learns S attended an activity)', case when yes and not no then 'VULNERABLE' else 'SECURE' end, format('stranger sees about S=%s, about self=%s', yes, no));
exception when others then perform pg_temp.say('R01', 'SECURE', 'blocked: ' || sqlerrm);
end $$;

-- ═══ R02: passport_entity_exists as an existence oracle ═══
do $$
declare x uuid := 'b0000000-0000-4000-8000-000000000002'; a boolean; b boolean;
begin
  perform passport_test.as_user(x);
  a := public.passport_entity_exists('organization', '01000000-0000-4000-8000-000000000001');
  b := public.passport_entity_exists('organization', gen_random_uuid());
  perform pg_temp.say('R02 entity_exists oracle (needs an unguessable id)', case when a and not b then 'INFO' else 'SECURE' end, format('exists=%s, random=%s', a, b));
exception when others then perform pg_temp.say('R02', 'SECURE', sqlerrm);
end $$;

-- ═══ R03: system-wide expiry sweeps callable by any authenticated user ═══
do $$
declare x uuid := 'b0000000-0000-4000-8000-000000000002';
begin
  perform passport_test.as_user(x);
  perform public.passport_expire_due_capture_requests();
  perform public.passport_expire_due_consents();
  perform public.passport_expire_due_claims();
  perform pg_temp.say('R03 expiry sweeps callable by a stranger', 'INFO', 'all three ran; they only advance rows already past expiry (state-correct, but an unauthenticated-cost amplifier)');
exception when others then perform pg_temp.say('R03', 'SECURE', sqlerrm);
end $$;

-- ═══ R04: anon reads RAW public claim rows (columns the explanation RPC hides from the public) ═══
do $$
declare cl uuid := (select claim_id from fx); s uuid := 'a0000000-0000-4000-8000-000000000001'; r jsonb; row_ record;
begin
  perform passport_test.as_user(s);
  perform public.passport_set_claim_visibility(cl, 'public');
  perform passport_test.as_anon();
  select source_ref, issuer_id, created_by, value, status_reason_code into row_ from public.passport_claims where id = cl;
  r := public.passport_claim_explanation(cl);
  perform pg_temp.say('R04a anon direct SELECT of a public claim row',
    case when row_.source_ref is not null or row_.issuer_id is not null then 'VULNERABLE' else 'SECURE' end,
    format('source_ref=%s issuer_id=%s created_by=%s value=%s', row_.source_ref, row_.issuer_id, row_.created_by, row_.value));
  perform pg_temp.say('R04b explanation RPC hides source_ref from anon', case when r -> 'source' ->> 'ref' is null then 'SECURE' else 'VULNERABLE' end, 'the RPC says: ref=' || coalesce(r -> 'source' ->> 'ref', 'null') || ' (but the table exposes it, see R04a)');
  perform passport_test.reset();
exception when others then perform passport_test.reset(); perform pg_temp.say('R04', 'SECURE', sqlerrm);
end $$;

-- ═══ R05: consent revoked AFTER a capture request exists — does the gateway still accept evidence? ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'c0000000-0000-4000-8000-000000000003'; o1 uuid := '01000000-0000-4000-8000-000000000001';
        r jsonb; g uuid; rid uuid; ing jsonb; ing2 jsonb; before_ct bigint;
begin
  perform passport_test.as_user(own);
  perform public.passport_assign_authority(own, 'organization', o1, 'data_requester', array['capture_request'], '{}', now() + interval '30 days');
  r := public.passport_request_consent(s, 'organization', o1, 'capture_request', array['evidence_artifacts']);
  g := (r ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform public.passport_respond_consent(g, true, null, now() + interval '30 days');
  perform passport_test.as_user(own);
  r := public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'consent-req-0001', null, '{}', 'forbidden', 'forbidden', g, 72, null);
  rid := (r ->> 'id')::uuid;
  perform pg_temp.say('R05 setup: consent-based capture request created', case when (r ->> 'ok')::boolean then 'INFO' else 'SECURE' end, r::text);
  -- the subject REVOKES consent
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_consent(g, 'changed my mind'), 'revoked');
  perform passport_test.reset();
  perform passport_test.check_true((select status from public.passport_consent_grants where id = g) = 'revoked', 'grant is revoked');
  perform pg_temp.say('R05a request status after revoke', case when (select status from public.passport_capture_requests where id = rid) in ('cancelled','expired') then 'SECURE' else 'VULNERABLE' end, 'status=' || (select status from public.passport_capture_requests where id = rid));
  -- the connector still tries to use it
  perform passport_test.as_service();
  ing := public.passport_gateway_get_capture_request(rid);
  select count(*) into before_ct from public.passport_evidence;
  ing2 := public.passport_gateway_ingest_evidence_package('flow_capture', pg_temp.pkg(rid, s, '11111111-1111-4111-8111-111111111112', 'pkg-idem-9001'), repeat('a', 64));
  perform passport_test.reset();
  perform pg_temp.say('R05b gateway still serves the request after revoke', case when (ing ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, 'get_capture_request ok=' || (ing ->> 'ok'));
  perform pg_temp.say('R05c gateway still ingests evidence after revoke (consent not evaluated at point of use)', case when (ing2 ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, 'ingest ok=' || (ing2 ->> 'ok') || ' evidence rows +' || ((select count(*) from public.passport_evidence) - before_ct));
exception when others then perform passport_test.reset(); perform pg_temp.say('R05', 'INFO', 'setup/attack error: ' || sqlerrm);
end $$;

-- ═══ R06: capture requests are not bound to a producer/client ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; r jsonb; rid uuid; g jsonb; st jsonb; comp jsonb;
begin
  perform passport_test.as_user(s);
  r := public.passport_create_capture_request('person', s, 'skill_evidence', 'photo', 'subject-req-0001');
  rid := (r ->> 'id')::uuid;
  perform passport_test.as_service();
  -- a DIFFERENT gateway client (not the one this request is for) reads and drives it
  g := public.passport_gateway_get_capture_request(rid);
  st := public.passport_gateway_report_capture_status('some_other_connector', jsonb_build_object('schema_version','1.0','request_id', rid, 'status', 'started', 'capture_session_id', 'sess-x', 'idempotency_key', 'other-idem-0001'), repeat('b', 64));
  comp := public.passport_gateway_report_capture_status('some_other_connector', jsonb_build_object('schema_version','1.0','request_id', rid, 'status', 'completed', 'capture_session_id', 'sess-x', 'idempotency_key', 'other-idem-0002'), repeat('c', 64));
  perform passport_test.reset();
  perform pg_temp.say('R06a any client reads any capture request (no producer binding)', case when (g ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, 'ok=' || (g ->> 'ok') || ' — latent while only one connector exists');
  perform pg_temp.say('R06b another client drives a request it does not own', case when (st ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, st::text);
  perform pg_temp.say('R06c DB accepts status=completed with NO evidence (contract only allows accepted/started/failed)', case when (comp ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, comp::text || ' final status=' || (select status from public.passport_capture_requests where id = rid));
exception when others then perform passport_test.reset(); perform pg_temp.say('R06', 'INFO', sqlerrm);
end $$;

-- ═══ R07: ledger / provenance tamper attempts by the most privileged runtime role (service_role) ═══
do $$
declare cl uuid := (select claim_id from fx); n int := 0; msgs text := ''; sub uuid; rows_ int;
begin
  -- a claim that is NOT verified, so "flip it to verified with no decision" has a row to act on
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  sub := ((public.passport_create_claim('person', 'a0000000-0000-4000-8000-000000000001', 'skill.welding', '{}', 'private', 'standard', null, null, true)) ->> 'id')::uuid;
  perform passport_test.check_true(sub is not null, 'R07 setup: a submitted claim exists');
  perform passport_test.as_service();
  begin delete from public.passport_events; msgs := msgs || 'DELETE events: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_events set event_type = 'x.y'; msgs := msgs || 'UPDATE events: ALLOWED; '; exception when others then n := n + 1; end;
  begin truncate public.passport_events; msgs := msgs || 'TRUNCATE events: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_claims set status = 'verified' where id = sub; get diagnostics rows_ = row_count; msgs := msgs || format('claim->verified w/o decision: ALLOWED (%s row); ', rows_); exception when others then n := n + 1; end;
  begin update public.passport_evidence set provenance = '{"forged":true}'::jsonb; msgs := msgs || 'REWRITE evidence provenance: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_evidence set artifacts = '[]'::jsonb; msgs := msgs || 'REWRITE evidence artifacts: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_claims set source_ref = 'forged', source_system = 'forged' where id = cl; msgs := msgs || 'REWRITE claim source: ALLOWED; '; exception when others then n := n + 1; end;
  begin delete from public.passport_claims where id = cl; msgs := msgs || 'DELETE claim: ALLOWED; '; exception when others then n := n + 1; end;
  begin delete from public.passport_verifications; msgs := msgs || 'DELETE verifications: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_consent_grants set status = 'active'; msgs := msgs || 'UN-REVOKE consent: ALLOWED; '; exception when others then n := n + 1; end;
  begin update public.passport_gateway_receipts set result = '{}'::jsonb; msgs := msgs || 'REWRITE receipts: ALLOWED; '; exception when others then n := n + 1; end;
  perform passport_test.reset();
  perform pg_temp.say('R07 service_role tamper attempts', case when msgs = '' then 'SECURE' else 'VULNERABLE' end, format('%s of 11 blocked. %s', n, msgs));
exception when others then perform passport_test.reset(); perform pg_temp.say('R07', 'INFO', sqlerrm);
end $$;

-- ═══ R08: the subject rewriting their own provenance / verification through any granted path ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; cl uuid := (select claim_id from fx); n int := 0; msgs text := '';
begin
  perform passport_test.as_user(s);
  begin update public.passport_claims set source_system = 'forged' where id = cl; msgs := msgs || 'UPDATE claims; '; exception when others then n := n + 1; end;
  begin update public.passport_evidence set provenance = '{}'::jsonb; msgs := msgs || 'UPDATE evidence; '; exception when others then n := n + 1; end;
  begin insert into public.passport_verifications (claim_id, method, verifier_type, requested_by) values (cl, 'platform_verified', 'system', s); msgs := msgs || 'INSERT verification; '; exception when others then n := n + 1; end;
  begin delete from public.passport_events; msgs := msgs || 'DELETE events; '; exception when others then n := n + 1; end;
  begin insert into public.passport_authority_assignments (principal_id, entity_type, entity_id, authority_type, expires_at) values (s, 'organization', '01000000-0000-4000-8000-000000000001', 'credential_issuer', now() + interval '1 day'); msgs := msgs || 'INSERT authority; '; exception when others then n := n + 1; end;
  perform passport_test.reset();
  perform pg_temp.say('R08 subject direct writes to provenance/verification/authority/ledger', case when msgs = '' then 'SECURE' else 'VULNERABLE' end, format('%s of 5 blocked. %s', n, msgs));
exception when others then perform passport_test.reset(); perform pg_temp.say('R08', 'INFO', sqlerrm);
end $$;

-- ═══ R09: self-verification, and the sock-puppet organization ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; s2 uuid := 'd0000000-0000-4000-8000-000000000004';
        puppet uuid := '02000000-0000-4000-8000-000000000002'; r jsonb; cl uuid; vid uuid; direct jsonb; final text;
begin
  -- (a) the subject tries every direct route to verify their own claim
  perform passport_test.as_user(s);
  r := public.passport_create_claim('person', s, 'credential.license', '{"title":"Master Welder"}', 'private', 'standard', null, null, true);
  cl := (r ->> 'id')::uuid;
  direct := public.passport_request_verification(cl, 'peer_attested', 'person', s);
  perform pg_temp.say('R09a subject requests verification by themselves (peer)', case when (direct ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, direct::text);
  direct := public.passport_request_verification(cl, 'self_attested', 'person', s);
  perform pg_temp.say('R09b self_attested can never verify', case when (direct ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, direct::text);
  -- (b) sock puppet: S creates an org they own (any user can), assigns an accomplice account authority, requests verification by that org
  perform passport_test.reset();
  insert into public.organizations (id, owner_id, name) values (puppet, s, 'Buffalo Welding Guild');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_assign_authority(s2, 'organization', puppet, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'owner assigns accomplice');
  r := public.passport_request_verification(cl, 'organization_verified', 'organization', puppet);
  perform pg_temp.say('R09c subject requests verification by an organization they OWN', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  vid := (r ->> 'id')::uuid;
  -- S themself cannot decide
  r := public.passport_record_verification(vid, 'verified', 'documents_checked');
  perform pg_temp.say('R09d subject cannot decide their own claim (account level)', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  -- the accomplice decides
  perform passport_test.as_user(s2);
  r := public.passport_record_verification(vid, 'verified', 'documents_checked');
  perform passport_test.reset();
  select status into final from public.passport_claims where id = cl;
  perform pg_temp.say('R09e accomplice verifies S''s claim as their own puppet org => claim status', case when final = 'verified' then 'VULNERABLE' else 'SECURE' end, 'record_verification=' || r::text || ' claim.status=' || final || ' org.verified=' || (select verified from public.organizations where id = puppet));
exception when others then perform passport_test.reset(); perform pg_temp.say('R09', 'INFO', sqlerrm);
end $$;

-- ═══ R10: authority self-assignment ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002'; o1 uuid := '01000000-0000-4000-8000-000000000001'; r jsonb;
begin
  perform passport_test.as_user(s);
  r := public.passport_assign_authority(s, 'person', s, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days');
  perform pg_temp.say('R10a owning your PERSON record does not let you assign yourself authority', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  r := public.passport_assign_authority(s, 'organization', o1, 'data_requester', array['capture_request'], '{}', now() + interval '30 days');
  perform pg_temp.say('R10b non-owner cannot assign authority on someone else''s org', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  perform passport_test.as_user(x);
  r := public.passport_assign_authority(x, 'organization', o1, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days');
  perform pg_temp.say('R10c stranger cannot assign themselves authority on an org', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  perform passport_test.reset();
end $$;

-- ═══ R11: a user-created claim of a platform-reserved type ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; r jsonb; cl uuid; rows_ int;
begin
  perform passport_test.as_user(s);
  r := public.passport_create_claim('person', s, 'participation.activity', '{"title":"Led the NASA Mars mission","activity_type":"workshop"}', 'private', 'standard', now(), null, true);
  perform passport_test.reset();
  perform pg_temp.say('R11 a user can mint the platform-derived claim type participation.activity with an arbitrary title', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end,
    r::text || ' source_system=' || coalesce((select source_system from public.passport_claims where id = (r ->> 'id')::uuid), '-'));
end $$;

-- ═══ R12: gateway replay-protection and idempotency under real concurrency are covered by tests/db/repros/concurrency.sh ═══

-- ═══ R13: consent point-of-use: disclosure after revoke / after expiry-without-sweep / by a non-grantee / after the grantee lost authority ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; own uuid := 'c0000000-0000-4000-8000-000000000003'; x uuid := 'b0000000-0000-4000-8000-000000000002';
        req uuid := 'd0000000-0000-4000-8000-000000000004'; o1 uuid := '01000000-0000-4000-8000-000000000001';
        r jsonb; g uuid; d jsonb; aid uuid;
begin
  -- the org OWNER scopes a distinct principal (req) as a credential_check data_requester
  perform passport_test.as_user(own);
  r := public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['event_entry'], '{}', now() + interval '30 days');
  perform passport_test.check_true((r ->> 'ok')::boolean, 'R13 setup: assign requester: ' || r::text);
  aid := (r ->> 'id')::uuid;
  perform passport_test.as_user(req);
  r := public.passport_request_consent(s, 'organization', o1, 'event_entry', array['attendance']);
  perform passport_test.check_true((r ->> 'ok')::boolean, 'R13 setup: consent requested: ' || r::text);
  g := (r ->> 'id')::uuid;
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_respond_consent(g, true, null, now() + interval '30 days'), 'R13 setup: subject approves');
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform passport_test.check_true((d ->> 'ok')::boolean and (d ->> 'answer')::boolean, 'R13a CONTROL MUST PASS or R13b-e are vacuous: ' || d::text);
  perform pg_temp.say('R13a control: grantee gets a real, positive answer under an active grant', 'INFO', d::text);

  perform passport_test.as_user(x);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform pg_temp.say('R13b a non-grantee cannot use someone else''s grant', case when (d ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, d::text);

  -- the org owner revokes the requester's authority => the same grant must stop working (live authority)
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_revoke_authority(aid, 'left the org'), 'R13 setup: authority revoked');
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform pg_temp.say('R13c disclosure after the grantee''s authority was revoked (stale authorization)', case when (d ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, d::text);

  -- authority restored; now the GRANT expires by time with no sweep having run
  perform passport_test.as_user(own);
  perform passport_test.ok(public.passport_assign_authority(req, 'organization', o1, 'data_requester', array['event_entry'], '{}', now() + interval '30 days'), 'R13 setup: authority restored');
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform passport_test.check_true((d ->> 'ok')::boolean, 'R13d CONTROL: works again once authority is restored: ' || d::text);
  perform passport_test.reset();
  alter table public.passport_consent_grants disable trigger user;
  update public.passport_consent_grants set expires_at = now() - interval '1 minute' where id = g;
  alter table public.passport_consent_grants enable trigger user;
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform pg_temp.say('R13d disclosure under a grant past expires_at but never swept', case when (d ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, d::text);

  -- the subject revokes: disclosure must stop
  perform passport_test.reset();
  alter table public.passport_consent_grants disable trigger user;
  update public.passport_consent_grants set expires_at = now() + interval '1 day' where id = g;
  alter table public.passport_consent_grants enable trigger user;
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform passport_test.check_true((d ->> 'ok')::boolean, 'R13e CONTROL: works again before revocation: ' || d::text);
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_revoke_consent(g, 'no'), 'R13 setup: subject revokes');
  perform passport_test.as_user(req);
  d := public.passport_disclose(g, 'claim_valid', 'participation.activity', null);
  perform pg_temp.say('R13e disclosure after the subject revoked', case when (d ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, d::text);
  perform passport_test.reset();
exception when others then perform passport_test.reset(); perform pg_temp.say('R13', 'SETUP-FAILED', 'error: ' || sqlerrm);
end $$;

-- ═══ R14: relationships: impersonation and the legacy view ═══
do $$
declare s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002'; r jsonb; n bigint;
begin
  perform passport_test.as_user(x);
  r := public.passport_propose_relationship('person', s, 'mentor_of', 'person', x, '{}');
  perform pg_temp.say('R14a a stranger proposes a relationship AS someone else', case when (r ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end, r::text);
  select count(*) into n from public.passport_relationships_legacy where (from_id = s or to_id = s) and from_id <> x and to_id <> x;
  perform pg_temp.say('R14b stranger sees other people''s relationships in the legacy view', case when n > 0 then 'VULNERABLE' else 'SECURE' end, 'rows involving S visible to a stranger: ' || n);
  perform passport_test.reset();
end $$;

-- ═══ R15: the pre-existing passport_summary view, writable by anon? ═══
do $$
begin
  perform passport_test.as_anon();
  begin
    update public.passport_summary set reliability_score = 0;
    perform pg_temp.say('R15 anon UPDATE on pre-existing passport_summary view', 'VULNERABLE', 'update was accepted');
  exception when others then
    perform pg_temp.say('R15 anon UPDATE on pre-existing passport_summary view', 'SECURE', 'rejected: ' || sqlerrm);
  end;
  perform passport_test.reset();
end $$;

-- ═══ R16: pre-existing is_blocked_between callable by anon for arbitrary pairs ═══
do $$
declare a boolean;
begin
  perform passport_test.as_anon();
  a := public.is_blocked_between('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002');
  perform passport_test.reset();
  perform pg_temp.say('R16 (PRE-EXISTING, not introduced by V2) anon can call is_blocked_between(a,b) for any pair', 'INFO', 'callable by anon; returned ' || a);
exception when others then perform passport_test.reset(); perform pg_temp.say('R16', 'SECURE', sqlerrm);
end $$;

rollback;
