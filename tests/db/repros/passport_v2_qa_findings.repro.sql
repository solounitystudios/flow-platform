-- Passport V2: executable reproductions of the OPEN findings from the independent QA pass of the PUBLISHED stack (2026-09-21).
-- NOT a *.test.sql on purpose: replay.sh only runs tests/db/*.test.sql, so this never gates CI. Each probe prints
--   RESULT <id>: VULNERABLE | SECURE  <detail>
-- and everything happens in one transaction that is rolled back. VULNERABLE == the finding still reproduces.
-- Run:  KEEP=1 tests/db/replay.sh   (prints "container kept: <name>")
--       cat tests/db/_helpers.sql tests/db/repros/passport_v2_qa_findings.repro.sql \
--         | docker exec -i <name> psql -U postgres -d postgres -h localhost -q -X 2>&1 | grep RESULT
-- Findings: docs/security/passport-v2-independent-review.md ("QA pass of the published stack").

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'qa-s@t.local'), ('a1000000-0000-4000-8000-000000000002', 'qa-sock@t.local'),
  ('a1000000-0000-4000-8000-000000000003', 'qa-peer@t.local'), ('a1000000-0000-4000-8000-000000000004', 'qa-grantee@t.local');
update public.profiles set public_passport = true where id = 'a1000000-0000-4000-8000-000000000001';

do $$
declare
  s uuid := 'a1000000-0000-4000-8000-000000000001'; k uuid := 'a1000000-0000-4000-8000-000000000002';
  peer uuid := 'a1000000-0000-4000-8000-000000000003'; g uuid := 'a1000000-0000-4000-8000-000000000004';
  o uuid; c uuid; r jsonb; d jsonb; v uuid; act uuid := 'c1000000-0000-4000-8000-000000000001'; org uuid := 'b1000000-0000-4000-8000-00000000000a';
  gorg uuid := 'b1000000-0000-4000-8000-00000000000b'; gid uuid := gen_random_uuid(); n int;
begin
  -- ── F1 (HIGH): organizations.verified is guarded on UPDATE only — an INSERT can carry verified = true ─────────────────────────
  -- A second account K "creates an employer" that is already verified, gives itself reviewer authority, and verifies S's own claim.
  perform passport_test.as_user(k);
  insert into public.organizations (name, owner_id, verified) values ('Totally Real Employer', k, true) returning id into o;
  perform passport_test.ok(public.passport_assign_authority(k, 'organization', o, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'setup');
  perform passport_test.as_user(s);
  c := (public.passport_create_claim('person', s, 'credential.license', '{"class":"CDL-A"}', 'private', 'standard', null, null, true) ->> 'id')::uuid;
  r := public.passport_request_verification(c, 'employer_verified', 'organization', o);
  perform passport_test.as_user(k);
  d := case when (r ->> 'ok')::boolean then public.passport_record_verification((r ->> 'id')::uuid, 'verified') else r end;
  perform passport_test.reset();
  raise notice 'RESULT F1: % org inserted with verified=%; request=%; decision=%; claim status=%',
    case when (d ->> 'ok')::boolean then 'VULNERABLE' else 'SECURE' end,
    (select verified from public.organizations where id = o), r, d, (select status from public.passport_claims where id = c);

  -- ── F2 (MEDIUM): a host can self-register, check in and complete on their OWN activity -> a public "Verified by Flow" claim ────
  insert into public.organizations (id, owner_id, name) values (org, s, 'S Org');
  insert into public.activities (id, organization_id, created_by, title, activity_type, status) values (act, org, s, 'Self hosted class', 'class', 'published');
  perform passport_test.as_user(s);
  insert into public.activity_participants (activity_id, profile_id) values (act, s);
  d := public.check_in_activity_participant(act, s);
  d := public.complete_activity_participant(act, s);
  r := public.passport_claim_from_activity(act);
  if (r ->> 'ok')::boolean then perform public.passport_set_claim_visibility((r ->> 'id')::uuid, 'public'); end if;
  perform passport_test.as_anon();
  select count(*) into n from public.passport_public_claims(s, null, 20);
  perform passport_test.reset();
  raise notice 'RESULT F2: % one account hosts+attends+completes its own activity; claim=%; anon sees % public claim(s)',
    case when (r ->> 'ok')::boolean and n > 0 then 'VULNERABLE' else 'SECURE' end, r, n;

  -- ── R11-DB (MEDIUM, product-policy dependent): a member-created platform-reserved claim type counts in a consented disclosure ──
  perform passport_test.as_user(s);
  r := public.passport_create_claim('person', s, 'participation.activity', '{"title":"Led the NASA Mars mission"}', 'private', 'standard', now(), null, true); c := (r ->> 'id')::uuid;
  r := public.passport_request_verification(c, 'peer_attested', 'person', peer); v := (r ->> 'id')::uuid;
  perform passport_test.as_user(peer); perform passport_test.ok(public.passport_record_verification(v, 'verified'), 'setup: sock-puppet peer');
  perform passport_test.reset();
  perform set_config('flow.internal_write', 'true', true);
  insert into public.organizations (id, owner_id, name, verified) values (gorg, g, 'Grantee Org', true);
  perform set_config('flow.internal_write', '', true);
  perform passport_test.as_user(g); perform passport_test.ok(public.passport_assign_authority(g, 'organization', gorg, 'data_requester', array['hiring_review'], '{}', now() + interval '30 days'), 'setup');
  perform passport_test.reset();
  insert into public.passport_consent_grants (id, grantor_type, grantor_id, grantee_type, grantee_id, subject_type, subject_id, purpose, requested_categories, approved_categories, status, requested_by, decided_at, decided_by, expires_at)
    values (gid, 'person', s, 'organization', gorg, 'person', s, 'hiring_review', array['attendance'], array['attendance'], 'active', g, now(), s, now() + interval '10 days');
  perform passport_test.as_user(g); d := public.passport_disclose(gid, 'claim_valid', 'participation.activity'); perform passport_test.reset();
  raise notice 'RESULT R11: % manual-source, peer-verified participation.activity; source=%; public projection rows=%; consented disclosure=%',
    case when (d ->> 'answer')::boolean then 'VULNERABLE' else 'SECURE' end, (select source_system from public.passport_claims where id = c),
    (select count(*) from public.passport_public_claims(s, c)), d;

  -- ── F3 (LOW): the claims guard trigger is UPDATE-only; a privileged INSERT can create a verified claim directly ───────────────
  perform passport_test.as_service();
  begin
    insert into public.passport_claims (subject_type, subject_id, claim_type, value, status, created_by) values ('person', s, 'credential.license', '{}', 'verified', s);
    raise notice 'RESULT F3: VULNERABLE service_role inserted a claim with status=verified and no verification decision';
  exception when others then
    raise notice 'RESULT F3: SECURE refused (%)', sqlerrm;
  end;
  perform passport_test.reset();
end $$;

rollback;
