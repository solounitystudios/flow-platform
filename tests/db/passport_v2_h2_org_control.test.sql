-- Passport V2 — H2 regression matrix: ORGANIZATION-CONTROL verification bypass.
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)
--
-- THE FINDING. A person S could create an organization, give a SECOND account reviewer authority in it, and have
-- that account verify S's own claim "as" the organization. Different user ids, same controller. The organization
-- did not even need to be verified by FLOW.
--
-- THE INVARIANT. No verification / claim state may represent organization authority unless, at the moment the
-- authority is exercised, the actor holds live authority for THAT organization, THAT operation and THAT scope —
-- and the party verifying is independent of whoever controls the subject. Independence is over CONTROL (owner,
-- active owner/admin member, live authority assignment), never over user ids. Fail closed.
--
-- HOW THIS FILE IS BUILT. Every case is its own function h2."H2-nn". A runner executes ALL of them, collects the
-- results and only then raises, so against a vulnerable tree the output lists EVERY failing case (a plain
-- assertion file would stop at the first). Every denial has a POSITIVE CONTROL beside it so no case can pass
-- because the fixture or an RPC is simply broken. Cases use only public RPCs/catalog metadata, so the same file
-- runs (and fails) against the pre-fix schema.
--
-- Matrix:
--   H2-01 authorized, independent controller succeeds        H2-09  deleted / inactive relationship fails
--   H2-02 ordinary authenticated user fails                  H2-10  no stale authority after revocation
--   H2-03 member without the required authority fails        H2-11  replay of a decided verification fails
--   H2-04 authority for org A does not carry to org B        H2-12  parallel attempts (tests/db/h2_concurrency.sh)
--   H2-05 substituted org_id (the bypass itself) fails       H2-13  direct DB/RPC invocation cannot bypass
--   H2-06 substituted authority/verification id fails        H2-14  anonymous fails
--   H2-07 revoked authority fails immediately                H2-15  service/internal only via the trusted boundary
--   H2-08 expired authority fails

create schema h2;
grant usage on schema h2 to public;
create table passport_test.h2_results (id text primary key, ok boolean not null, detail text);
grant all on passport_test.h2_results to public;

-- ── fixture (only pre-existing primitives, so it also builds on the vulnerable schema) ─────────────────────────
-- S    subject person, owns org A (FLOW-verified, so a denial cannot be blamed on "unverified")
-- R    S's accomplice: holds reviewer authority INSIDE S's own org A
-- U    ordinary authenticated user, no relationship to anything
-- OI/RI owner of independent, FLOW-verified org I, and its scoped reviewer;  MB  recruiter member of I
-- OJ/RJ owner + reviewer of a second independent verified org J
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-000000000001', 'h2-s@test.local'),  ('91000000-0000-4000-8000-000000000002', 'h2-r@test.local'),
  ('91000000-0000-4000-8000-000000000003', 'h2-u@test.local'),  ('91000000-0000-4000-8000-000000000004', 'h2-oi@test.local'),
  ('91000000-0000-4000-8000-000000000005', 'h2-ri@test.local'), ('91000000-0000-4000-8000-000000000006', 'h2-mb@test.local'),
  ('91000000-0000-4000-8000-000000000007', 'h2-oj@test.local'), ('91000000-0000-4000-8000-000000000008', 'h2-rj@test.local');
insert into public.organizations (id, owner_id, name) values
  ('92000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001', 'H2 Org A (S owns)'),
  ('92000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-000000000004', 'H2 Org I (independent)'),
  ('92000000-0000-4000-8000-00000000000c', '91000000-0000-4000-8000-000000000007', 'H2 Org J (independent)');
insert into public.organization_members (organization_id, profile_id, role, status) values
  ('92000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-000000000006', 'recruiter', 'active');
select set_config('flow.internal_write', 'true', true);
update public.organizations set verified = true where name like 'H2 Org %';
select set_config('flow.internal_write', '', true);

-- authority: each owner scopes THEIR reviewer to credential.* claims (S does the same for the accomplice in S's own org)
do $$ begin
  perform passport_test.as_user('91000000-0000-4000-8000-000000000001');
  perform passport_test.ok(public.passport_assign_authority('91000000-0000-4000-8000-000000000002', 'organization', '92000000-0000-4000-8000-00000000000a', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'fixture: accomplice authority in S''s org');
  perform passport_test.as_user('91000000-0000-4000-8000-000000000004');
  perform passport_test.ok(public.passport_assign_authority('91000000-0000-4000-8000-000000000005', 'organization', '92000000-0000-4000-8000-00000000000b', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'fixture: RI authority in I');
  perform passport_test.as_user('91000000-0000-4000-8000-000000000007');
  perform passport_test.ok(public.passport_assign_authority('91000000-0000-4000-8000-000000000008', 'organization', '92000000-0000-4000-8000-00000000000c', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'fixture: RJ authority in J');
  perform passport_test.reset();
end $$;

-- helpers: S opens a fresh credential.license claim and asks org <org> to verify it → (claim_id, verification id, raw response)
create function h2.ask(p_org uuid, p_tag text) returns table (claim_id uuid, ver_id uuid, resp jsonb) language plpgsql as $$
declare s uuid := '91000000-0000-4000-8000-000000000001'; c uuid;
begin
  perform passport_test.as_user(s);
  c := (public.passport_create_claim('person', s, 'credential.license', jsonb_build_object('tag', p_tag), 'private', 'standard', null, null, true) ->> 'id')::uuid;
  claim_id := c; resp := public.passport_request_verification(c, 'organization_verified', 'organization', p_org);
  ver_id := (resp ->> 'id')::uuid;
  perform passport_test.reset();
  return next;
end $$;
create function h2.status_of(p_claim uuid) returns text language sql as $$ select status from public.passport_claims where id = p_claim $$;
create function h2.aid(p_principal uuid, p_org uuid) returns uuid language sql as $$
  select id from public.passport_authority_assignments where principal_id = p_principal and entity_id = p_org and status = 'active' order by created_at desc limit 1 $$;

-- ── H2-01 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-01"() returns void language plpgsql as $$
declare k record; ri uuid := '91000000-0000-4000-8000-000000000005';
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h201');
  perform passport_test.ok(k.resp, 'S may ask an independent, FLOW-verified org');
  perform passport_test.as_user(ri);
  perform passport_test.ok(public.passport_record_verification(k.ver_id, 'verified', 'documents_checked'), 'its scoped reviewer decides');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'verified', 'the legitimate path still yields a verified claim');
end $$;

-- ── H2-02 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-02"() returns void language plpgsql as $$
declare k record; u uuid := '91000000-0000-4000-8000-000000000003'; oi uuid := '91000000-0000-4000-8000-000000000004';
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h202'); perform passport_test.ok(k.resp, 'setup');
  perform passport_test.as_user(u);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'an ordinary authenticated user cannot decide');
  perform passport_test.as_user(oi);   -- even the org's OWNER, absent an explicit assignment (ownership proves ownership, not review rights)
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'the owner without a reviewer assignment cannot decide');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review' and (select count(*) from public.passport_verifications where claim_id = k.claim_id and decision is not null) = 0, 'nothing moved');
end $$;

-- ── H2-03 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-03"() returns void language plpgsql as $$
declare k record; mb uuid := '91000000-0000-4000-8000-000000000006';
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h203'); perform passport_test.ok(k.resp, 'setup');
  perform passport_test.as_user(mb);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'an active RECRUITER member of the org cannot decide');
  perform passport_test.reset();
  update public.organization_members set role = 'admin' where organization_id = '92000000-0000-4000-8000-00000000000b' and profile_id = mb;
  perform passport_test.as_user(mb);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'nor can an ADMIN-role member: a role is not authority');
  perform passport_test.reset();
  update public.organization_members set role = 'recruiter' where organization_id = '92000000-0000-4000-8000-00000000000b' and profile_id = mb;
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review', 'nothing moved');
  -- CONTROL: the member who DOES hold the scoped authority decides the very same request
  perform passport_test.as_user('91000000-0000-4000-8000-000000000005');
  perform passport_test.ok(public.passport_record_verification(k.ver_id, 'verified'), 'CONTROL: the authority holder decides');
  perform passport_test.reset();
end $$;

-- ── H2-04 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-04"() returns void language plpgsql as $$
declare kj record; ki record; ri uuid := '91000000-0000-4000-8000-000000000005'; rj uuid := '91000000-0000-4000-8000-000000000008';
begin
  select * into kj from h2.ask('92000000-0000-4000-8000-00000000000c', 'h204j'); perform passport_test.ok(kj.resp, 'setup: request to org J');
  perform passport_test.as_user(ri);   -- RI is authorized for org I, not J
  perform passport_test.denied(public.passport_record_verification(kj.ver_id, 'verified'), 'not_authorized', 'authority for org I does not let RI decide a request addressed to org J');
  perform passport_test.check_true(passport_test.count_of(format('select count(*) from public.passport_claims where id = %L', kj.claim_id)) = 0, 'and RI cannot even read that claim');
  perform passport_test.as_user(rj);
  perform passport_test.ok(public.passport_record_verification(kj.ver_id, 'verified'), 'CONTROL: org J''s own reviewer decides it');
  perform passport_test.reset();
  select * into ki from h2.ask('92000000-0000-4000-8000-00000000000b', 'h204i'); perform passport_test.ok(ki.resp, 'setup: request to org I');
  perform passport_test.as_user(rj);
  perform passport_test.denied(public.passport_record_verification(ki.ver_id, 'verified'), 'not_authorized', 'and the reverse: RJ cannot decide a request addressed to org I');
  perform passport_test.reset();
end $$;

-- ── H2-05 — THE BYPASS ─────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-05"() returns void language plpgsql as $$
declare s uuid := '91000000-0000-4000-8000-000000000001'; r uuid := '91000000-0000-4000-8000-000000000002'; oa uuid := '92000000-0000-4000-8000-00000000000a';
        c uuid; v uuid;
begin
  perform passport_test.as_user(s);
  c := (public.passport_create_claim('person', s, 'credential.license', '{"tag":"h205"}', 'public', 'standard', null, null, true) ->> 'id')::uuid;
  -- S names the org S owns (a substituted org id: "an organization", but the wrong one to trust) → refused
  perform passport_test.denied(public.passport_request_verification(c, 'organization_verified', 'organization', oa), 'verifier_not_independent', 'an org S owns cannot verify S''s claim');
  perform passport_test.denied(public.passport_request_verification(c, 'organization_verified', 'business', oa),     'verifier_not_independent', 'the alias "business" changes nothing');
  perform passport_test.denied(public.passport_request_verification(c, 'employer_verified', 'organization', oa),     'verifier_not_independent', 'nor does another method');
  -- the accomplice cannot open the request on S's behalf either
  perform passport_test.as_user(r);
  perform passport_test.denied(public.passport_request_verification(c, 'organization_verified', 'organization', oa), 'not_found', 'the accomplice cannot request for S');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(c) = 'submitted' and (select count(*) from public.passport_verifications where claim_id = c) = 0, 'no request, no decision, claim untouched');
  -- a swapped verifier on an existing, legitimately-opened request is impossible: verifications are immutable in their identity columns
  select ver_id into v from h2.ask('92000000-0000-4000-8000-00000000000b', 'h205swap');
  perform passport_test.raises(format('update public.passport_verifications set verifier_id = %L where id = %L', oa, v), 'a pending request cannot be re-pointed at the subject''s own org');
  -- a privileged writer that inserts the decision directly still cannot make the claim verified (the guard trigger)
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (c, 'organization_verified', 'organization', oa, 'completed', 'verified', now(), r);
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', c), 'even a privileged writer cannot flip a claim to verified through the subject''s own org');
  perform passport_test.check_true(h2.status_of(c) = 'submitted', 'still not verified');
end $$;

-- ── H2-06 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-06"() returns void language plpgsql as $$
declare s uuid := '91000000-0000-4000-8000-000000000001'; oi uuid := '91000000-0000-4000-8000-000000000004'; ri uuid := '91000000-0000-4000-8000-000000000005';
        rj uuid := '91000000-0000-4000-8000-000000000008'; r uuid := '91000000-0000-4000-8000-000000000002'; u uuid := '91000000-0000-4000-8000-000000000003';
        k record; a_i uuid; a_a uuid;
begin
  -- a substituted VERIFICATION id: an unrelated / random / other-org verification id is indistinguishable from "no such request"
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h206'); perform passport_test.ok(k.resp, 'setup');
  -- (ids are looked up as the neutral role: assignment rows are RLS-scoped, which is itself part of the point)
  a_i := h2.aid(ri, '92000000-0000-4000-8000-00000000000b'); a_a := h2.aid(r, '92000000-0000-4000-8000-00000000000a');
  perform passport_test.check_true(a_i is not null and a_a is not null, 'setup: both assignments exist');
  perform passport_test.as_user(rj);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'a reviewer of another org, holding a valid id of THIS request, is refused');
  perform passport_test.denied(public.passport_record_verification(gen_random_uuid(), 'verified'), 'not_found', 'a made-up verification id');
  -- a substituted AUTHORITY-ASSIGNMENT id: the assignment is the relationship that carries authority, and only its entity's owner may end it
  perform passport_test.as_user(s);   -- S owns org A, not org I
  perform passport_test.denied(public.passport_revoke_authority(a_i), 'not_authorized', 'S cannot revoke (or otherwise steer) org I''s assignment by supplying its id');
  perform passport_test.as_user(u);
  perform passport_test.denied(public.passport_revoke_authority(a_a), 'not_authorized', 'a stranger cannot end S''s assignment either');
  perform passport_test.reset();
  perform passport_test.check_true(h2.aid(ri, '92000000-0000-4000-8000-00000000000b') = a_i, 'CONTROL: the assignment was untouched by every refused attempt');
end $$;

-- ── H2-07 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-07"() returns void language plpgsql as $$
declare k record; oi uuid := '91000000-0000-4000-8000-000000000004'; ri uuid := '91000000-0000-4000-8000-000000000005'; a uuid;
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h207'); perform passport_test.ok(k.resp, 'setup');
  a := h2.aid(ri, '92000000-0000-4000-8000-00000000000b');
  perform passport_test.as_user(ri); perform passport_test.check_true(public.passport_has_authority('organization', '92000000-0000-4000-8000-00000000000b', 'evidence_reviewer', null, 'credential.license'), 'setup: RI holds authority');
  perform passport_test.as_user(oi); perform passport_test.ok(public.passport_revoke_authority(a, 'left the org'), 'the owner revokes it');
  perform passport_test.as_user(ri);   -- the very next call, same session, same transaction
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'REVOKED authority is refused immediately');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review', 'nothing moved');
  perform passport_test.as_user(oi);   -- CONTROL: re-granting restores the ability (so the denial was about authority, not a broken fixture)
  perform passport_test.ok(public.passport_assign_authority(ri, 'organization', '92000000-0000-4000-8000-00000000000b', 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'owner re-assigns');
  perform passport_test.as_user(ri); perform passport_test.ok(public.passport_record_verification(k.ver_id, 'verified'), 'CONTROL: same reviewer, same request, now succeeds');
  perform passport_test.reset();
end $$;

-- ── H2-08 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-08"() returns void language plpgsql as $$
declare k record; oi uuid := '91000000-0000-4000-8000-000000000004'; ri uuid := '91000000-0000-4000-8000-000000000005'; a uuid;
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h208'); perform passport_test.ok(k.resp, 'setup');
  a := h2.aid(ri, '92000000-0000-4000-8000-00000000000b');
  update public.passport_authority_assignments set starts_at = now() - interval '2 days', expires_at = now() - interval '1 second' where id = a;   -- time passes; nobody swept anything
  perform passport_test.as_user(ri);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'EXPIRED authority is refused even though no sweep has run');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review', 'nothing moved');
  update public.passport_authority_assignments set starts_at = now() - interval '1 day', expires_at = now() + interval '10 days' where id = a;
  perform passport_test.as_user(ri); perform passport_test.ok(public.passport_record_verification(k.ver_id, 'verified'), 'CONTROL: with the window valid again the same call succeeds');
  perform passport_test.reset();
  -- a not-yet-started assignment confers nothing either
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h208b'); perform passport_test.ok(k.resp, 'setup 2');
  update public.passport_authority_assignments set starts_at = now() + interval '1 day', expires_at = now() + interval '10 days' where id = a;
  perform passport_test.as_user(ri); perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'authority that has not started yet confers nothing');
  perform passport_test.reset();
  update public.passport_authority_assignments set starts_at = now() - interval '1 day' where id = a;
end $$;

-- ── H2-09 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-09"() returns void language plpgsql as $$
declare k record; ri uuid := '91000000-0000-4000-8000-000000000005'; a uuid; saved jsonb;
begin
  -- the authority row is DELETED (not revoked): the relationship no longer exists → nothing to exercise
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h209'); perform passport_test.ok(k.resp, 'setup');
  a := h2.aid(ri, '92000000-0000-4000-8000-00000000000b');
  select to_jsonb(x) into saved from public.passport_authority_assignments x where id = a;
  alter table public.passport_authority_assignments disable trigger user;   -- (fixture only: the rows are normally undeletable; this proves the decision path re-reads them)
  delete from public.passport_authority_assignments where id = a;
  perform passport_test.as_user(ri);
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_authorized', 'a deleted assignment confers nothing');
  perform passport_test.reset();
  insert into public.passport_authority_assignments select * from jsonb_populate_record(null::public.passport_authority_assignments, saved);
  alter table public.passport_authority_assignments enable trigger user;
  perform passport_test.as_user(ri); perform passport_test.ok(public.passport_record_verification(k.ver_id, 'verified'), 'CONTROL: with the row restored the same call succeeds');
  perform passport_test.reset();
end $$;

-- ── H2-09b: an INACTIVE membership is not control ────────────────────────────────────────────────────────────
-- (control comes from ACTIVE owner/admin membership only; a suspended or removed admin no longer speaks for the org, so the
--  org may verify them — the flip side of H2-05, and the reason "member" is never treated as "controller")
create function h2."H2-09b"() returns void language plpgsql as $$
declare s uuid := '91000000-0000-4000-8000-000000000001'; ri uuid := '91000000-0000-4000-8000-000000000005'; ob uuid := '92000000-0000-4000-8000-00000000000b';
        k record; st text;
begin
  foreach st in array array['suspended', 'removed', 'invited'] loop
    insert into public.organization_members (organization_id, profile_id, role, status) values (ob, s, 'admin', st);
    select * into k from h2.ask(ob, 'h209b-' || st);
    perform passport_test.ok(k.resp, 'a ' || st || ' admin is not control: org I may be asked');
    delete from public.organization_members where organization_id = ob and profile_id = s;
  end loop;
  insert into public.organization_members (organization_id, profile_id, role, status) values (ob, s, 'admin', 'active');
  select * into k from h2.ask(ob, 'h209b-active');
  perform passport_test.denied(k.resp, 'verifier_not_independent', 'CONTROL: the same admin, once ACTIVE, IS control');
  delete from public.organization_members where organization_id = ob and profile_id = s;
end $$;

-- ── H2-10 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-10"() returns void language plpgsql as $$
declare oi uuid := '91000000-0000-4000-8000-000000000004'; ri uuid := '91000000-0000-4000-8000-000000000005'; org uuid := '92000000-0000-4000-8000-00000000000b'; a uuid;
begin
  -- Authority is computed from the table on EVERY call (STABLE SQL, no memoisation, no session cache): the check and the
  -- revocation happen inside ONE transaction and the change is visible to the very next call.
  perform passport_test.as_user(ri);
  perform passport_test.check_true(public.passport_has_authority('organization', org, 'evidence_reviewer', null, 'credential.license'), 'before: held');
  a := h2.aid(ri, org);
  perform passport_test.as_user(oi); perform passport_test.ok(public.passport_revoke_authority(a, 'test'), 'revoke');
  perform passport_test.as_user(ri);
  perform passport_test.check_true(not public.passport_has_authority('organization', org, 'evidence_reviewer', null, 'credential.license'), 'after: gone immediately');
  perform passport_test.check_true(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('passport_has_authority', 'passport_can_act_as_verifier') and p.provolatile = 'i'), 'no authority function is declared IMMUTABLE (which would allow plan-time caching)');
  perform passport_test.as_user(oi);
  perform passport_test.ok(public.passport_assign_authority(ri, 'organization', org, 'evidence_reviewer', '{}', array['credential'], now() + interval '30 days'), 'restore');
  perform passport_test.reset();
end $$;

-- ── H2-11 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-11"() returns void language plpgsql as $$
declare k record; ri uuid := '91000000-0000-4000-8000-000000000005'; oi uuid := '91000000-0000-4000-8000-000000000004';
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h211'); perform passport_test.ok(k.resp, 'setup');
  perform passport_test.as_user(ri); perform passport_test.ok(public.passport_record_verification(k.ver_id, 'rejected', 'insufficient_evidence'), 'first decision: rejected');
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'verified'), 'not_pending', 'REPLAY: the same request cannot be decided again with a different outcome');
  perform passport_test.denied(public.passport_record_verification(k.ver_id, 'rejected', 'insufficient_evidence'), 'not_pending', 'nor with the same outcome');
  perform passport_test.reset();
  perform passport_test.raises(format('update public.passport_verifications set decision = ''verified'' where id = %L', k.ver_id), 'a completed decision is immutable, even to a privileged writer');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', k.claim_id), 'a rejected claim can never be verified afterwards');
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'rejected', 'the first decision stands');
end $$;

-- ── H2-12 ───────────────────────────────────────────────────────────────────────────────────────────────────
-- Real parallel sessions cannot run inside one rolled-back transaction: see tests/db/h2_concurrency.sh (run by replay.sh).
create function h2."H2-12"() returns void language plpgsql as $$
begin
  -- The two DB properties that script relies on, asserted here so a refactor cannot silently remove them:
  perform passport_test.check_true(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'passport_authority_one_active_idx'), 'one ACTIVE authority per (principal, entity, type) is enforced by a unique index, not by app code');
  perform passport_test.check_true(exists (select 1 from pg_proc p where p.proname = 'passport_record_verification' and pg_get_functiondef(p.oid) ilike '%for update%'), 'the decision RPC serialises on the claim row (FOR UPDATE)');
end $$;

-- ── H2-13 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-13"() returns void language plpgsql as $$
declare fn text; c uuid := gen_random_uuid();
begin
  -- the decision helpers exist and no client role can call them (so no client can probe control sets or skip the RPC)
  foreach fn in array array['public.passport_org_controllers(uuid)', 'public.passport_controls(uuid,text,uuid)', 'public.passport_org_is_verified(uuid)', 'public.passport_verifier_independent(text,uuid,text,uuid)'] loop
    perform passport_test.check_true(not has_function_privilege('anon', fn, 'execute'), fn || ': anon cannot execute');
    perform passport_test.check_true(not has_function_privilege('authenticated', fn, 'execute'), fn || ': authenticated cannot execute');
    perform passport_test.check_true(has_function_privilege('service_role', fn, 'execute'), fn || ': the trusted boundary (service_role) can');
  end loop;
  -- direct writes to the tables the RPCs guard: refused for every client role
  perform passport_test.as_user('91000000-0000-4000-8000-000000000001');
  perform passport_test.raises(format('insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision) values (%L, ''organization_verified'', ''organization'', %L, ''completed'', ''verified'')', c, '92000000-0000-4000-8000-00000000000a'), 'a client cannot insert a verification decision');
  perform passport_test.raises(format('insert into public.passport_authority_assignments (principal_id, entity_type, entity_id, authority_type, scope_prefixes, starts_at, expires_at) values (%L, ''organization'', %L, ''evidence_reviewer'', array[''credential''], now(), now() + interval ''1 day'')', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-00000000000a'), 'a client cannot mint its own authority row');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where subject_id = %L', '91000000-0000-4000-8000-000000000001'), 'a client cannot flip a claim to verified');
  perform passport_test.reset();
  insert into public.organizations (id, owner_id, name) values ('92000000-0000-4000-8000-0000000000ff', '91000000-0000-4000-8000-000000000001', 'H2 unverified org owned by S');
  perform passport_test.as_user('91000000-0000-4000-8000-000000000001');
  perform passport_test.raises(format('update public.organizations set verified = true where id = %L', '92000000-0000-4000-8000-0000000000ff'), 'an owner cannot self-assign organizations.verified');
  perform passport_test.reset();
  -- ...and neither can a privileged writer (guard trigger): covered against the subject's own org in H2-05, and here for an UNVERIFIED org
  perform set_config('flow.internal_write', 'true', true);
  update public.organizations set verified = false where id = '92000000-0000-4000-8000-00000000000c';
  perform set_config('flow.internal_write', '', true);
  insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, status, created_by)
    values (c, 'person', '91000000-0000-4000-8000-000000000003', 'credential.license', '{}', 'under_review', '91000000-0000-4000-8000-000000000003');
  insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, decided_at, decided_by)
    values (c, 'organization_verified', 'organization', '92000000-0000-4000-8000-00000000000c', 'completed', 'verified', now(), '91000000-0000-4000-8000-000000000008');
  perform passport_test.raises(format('update public.passport_claims set status = ''verified'' where id = %L', c), 'a privileged writer cannot verify through an org FLOW has not verified');
  perform set_config('flow.internal_write', 'true', true);
  update public.organizations set verified = true where id = '92000000-0000-4000-8000-00000000000c';
  perform set_config('flow.internal_write', '', true);
  update public.passport_claims set status = 'verified' where id = c;
  perform passport_test.check_true(h2.status_of(c) = 'verified', 'CONTROL: the same shape through a verified, independent org is admitted');
end $$;

-- ── H2-14 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-14"() returns void language plpgsql as $$
declare k record; fn text;
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h214'); perform passport_test.ok(k.resp, 'setup');
  foreach fn in array array['public.passport_request_verification(uuid,text,text,uuid)', 'public.passport_record_verification(uuid,text,text,timestamptz)', 'public.passport_assign_authority(uuid,text,uuid,text,text[],text[],timestamptz)', 'public.passport_revoke_authority(uuid,text)', 'public.passport_create_claim(text,uuid,text,jsonb,text,text,timestamptz,timestamptz,boolean)'] loop
    perform passport_test.check_true(not has_function_privilege('anon', fn, 'execute'), fn || ': anon has no EXECUTE');
  end loop;
  perform passport_test.as_anon();
  perform passport_test.raises(format('select public.passport_record_verification(%L, ''verified'')', k.ver_id), 'anonymous cannot decide a verification');
  perform passport_test.raises(format('select public.passport_request_verification(%L, ''organization_verified'', ''organization'', %L)', k.claim_id, '92000000-0000-4000-8000-00000000000b'), 'anonymous cannot request one');
  perform passport_test.raises(format('select public.passport_assign_authority(%L, ''organization'', %L, ''evidence_reviewer'', ''{}'', array[''credential''], now() + interval ''1 day'')', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-00000000000a'), 'anonymous cannot assign authority');
  perform passport_test.reset();
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review', 'nothing moved');
end $$;

-- ── H2-15 ───────────────────────────────────────────────────────────────────────────────────────────────────
create function h2."H2-15"() returns void language plpgsql as $$
declare k record; r jsonb;
begin
  select * into k from h2.ask('92000000-0000-4000-8000-00000000000b', 'h215'); perform passport_test.ok(k.resp, 'setup');
  -- service_role is the gateway's credential. It has no auth.uid(), so it can NEVER act as an org's reviewer through the
  -- decision RPC: an org decision needs a real, authorised human principal.
  perform passport_test.as_service();
  begin r := public.passport_record_verification(k.ver_id, 'verified'); exception when others then r := jsonb_build_object('ok', false, 'reason', 'raised'); end;
  perform passport_test.reset();
  perform passport_test.check_true(coalesce((r ->> 'ok')::boolean, false) is false, 'service_role cannot decide an org verification (got ' || r::text || ')');
  perform passport_test.check_true(h2.status_of(k.claim_id) = 'under_review', 'nothing moved');
  -- the trusted boundary that DOES exist: service_role executes the internal decision helpers (server-side only)
  perform passport_test.as_service();
  perform passport_test.check_true(public.passport_verifier_independent('person', '91000000-0000-4000-8000-000000000001', 'organization', '92000000-0000-4000-8000-00000000000b'), 'service_role can evaluate independence (server-side)');
  perform passport_test.check_true(not public.passport_verifier_independent('person', '91000000-0000-4000-8000-000000000001', 'organization', '92000000-0000-4000-8000-00000000000a'), 'and it says no for S''s own org');
  perform passport_test.reset();
end $$;

-- ── runner: execute every case, collect, and only then fail ────────────────────────────────────────────────
do $$
declare f record; failed int; msg text;
begin
  for f in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'h2' and p.proname like 'H2-%' order by p.proname loop
    begin
      execute format('select h2.%I()', f.proname);
      insert into passport_test.h2_results values (f.proname, true, null);
    exception when others then
      perform passport_test.reset();
      get stacked diagnostics msg = message_text;
      insert into passport_test.h2_results values (f.proname, false, msg);
    end;
  end loop;
  select count(*) into failed from passport_test.h2_results where not ok;
  for f in select id, ok, detail from passport_test.h2_results order by id loop
    raise notice '% %  %', case when f.ok then 'PASS' else 'FAIL' end, f.id, coalesce(left(f.detail, 220), '');
  end loop;
  if (select count(*) from passport_test.h2_results) <> 16 then raise exception 'H2 matrix incomplete: expected 16 cases (15 matrix + H2-09b)'; end if;
  if failed > 0 then raise exception 'H2 matrix: % of 16 cases FAILED', failed; end if;
end $$;

rollback;
select 'passport_v2_h2_org_control: 16/16 cases passed' as result;
