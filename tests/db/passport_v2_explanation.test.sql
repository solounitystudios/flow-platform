-- Passport V2: claim explanation ("Why does Passport show this?") — viewer-aware disclosure.
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)

-- S subject person · OWN owner of Org One (a verifier) · PEER a peer verifier · X stranger
-- REV a person holding evidence_reviewer for Org One · ADM platform admin
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 's@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'own@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'peer@test.local'),
  ('d0000000-0000-4000-8000-000000000004', 'x@test.local'),
  ('e0000000-0000-4000-8000-000000000005', 'rev@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'adm@test.local');
update public.profiles set full_name = 'Sam Subject' where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Pat Peer' where id = 'c0000000-0000-4000-8000-000000000003';
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Buffalo Welding Guild');

-- This fixture represents an organization Flow has independently verified.
-- Organization verification cannot be self-assigned by the organization.
select set_config('flow.internal_write', 'true', true);
update public.organizations
   set verified = true
 where id = '01000000-0000-4000-8000-000000000001';
select set_config('flow.internal_write', '', true);

insert into public.admins (profile_id, role, active) values ('f0000000-0000-4000-8000-000000000006', 'admin', true);

-- an org-verified public license claim with two pieces of evidence (one with a sensitive artifact ref)
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, issuer_kind, visibility, status, effective_at, expires_at, source_system, source_ref, created_by)
  values ('c1000000-0000-4000-8000-000000000001', 'person', 'a0000000-0000-4000-8000-000000000001', 'credential.license', '{"class":"CDL-A"}', 'subject', 'public', 'submitted',
          now() - interval '5 days', now() + interval '200 days', 'flow_platform', 'INTERNAL-REF-77', 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_evidence (id, subject_type, subject_id, evidence_type, source_kind, artifacts, provenance, sensitivity, status, created_by) values
  ('e1000000-0000-4000-8000-0000000000e1', 'person', 'a0000000-0000-4000-8000-000000000001', 'document', 'manual_upload',
   '[{"artifact_id":"doc-1","kind":"document","media_type":"application/pdf","storage":{"provider":"flow_storage","ref":"evidence/SECRET-PATH/license.pdf"}}]', '{"note":"PRIVATE-NOTE-do-not-leak"}', 'sensitive', 'received', 'a0000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-0000000000e2', 'person', 'a0000000-0000-4000-8000-000000000001', 'photo', 'manual_upload',
   '[{"artifact_id":"ph-1","kind":"photo","media_type":"image/jpeg","storage":{"provider":"flow_storage","ref":"evidence/SECRET-PATH/photo.jpg"}}]', '{}', 'standard', 'received', 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_claim_evidence (claim_id, evidence_id, attached_by) values
  ('c1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-0000000000e1', 'a0000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-0000000000e2', 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, reason_code, decided_at, decided_by, expires_at)
  values ('c1000000-0000-4000-8000-000000000001', 'organization_verified', 'organization', '01000000-0000-4000-8000-000000000001', 'completed', 'verified', 'documents_checked', now() - interval '4 days', 'e0000000-0000-4000-8000-000000000005', now() + interval '200 days');
update public.passport_claims set status = 'verified' where id = 'c1000000-0000-4000-8000-000000000001';
insert into public.passport_events (event_type, actor_type, actor_id, subject_type, subject_id, refs)
  values ('claim.created', 'person', 'a0000000-0000-4000-8000-000000000001', 'person', 'a0000000-0000-4000-8000-000000000001', '{"claim_id":"c1000000-0000-4000-8000-000000000001"}'),
         ('claim.verified', 'person', 'e0000000-0000-4000-8000-000000000005', 'person', 'a0000000-0000-4000-8000-000000000001', '{"claim_id":"c1000000-0000-4000-8000-000000000001"}');

-- a PRIVATE peer-verified claim, with a request still pending on another
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, visibility, status, effective_at, created_by)
  values ('c2000000-0000-4000-8000-000000000002', 'person', 'a0000000-0000-4000-8000-000000000001', 'attestation.peer', '{"who":"pat"}', 'private', 'submitted', now(), 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, requested_by)
  values ('c2000000-0000-4000-8000-000000000002', 'peer_attested', 'person', 'c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001');
update public.passport_claims set status = 'under_review' where id = 'c2000000-0000-4000-8000-000000000002';

do $$
declare r jsonb; pub uuid := 'c1000000-0000-4000-8000-000000000001'; priv uuid := 'c2000000-0000-4000-8000-000000000002';
        s uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'd0000000-0000-4000-8000-000000000004';
        peer uuid := 'c0000000-0000-4000-8000-000000000003'; adm uuid := 'f0000000-0000-4000-8000-000000000006';
        nothing jsonb;
begin
  -- ── owner: the full chain, but never a source document ──
  perform passport_test.as_user(s);
  r := public.passport_claim_explanation(pub);
  perform passport_test.ok(r, 'the owner can ask why');
  perform passport_test.check_true((r ->> 'viewer') = 'owner', 'viewer is the owner');
  -- wire shape == the ClaimExplanation contract (tests/unit compares these lists to the zod schema)
  perform passport_test.check_true((select array_agg(k order by k collate "C") from jsonb_object_keys(r) k) = (select array_agg(kk order by kk collate "C") from unnest(array['ok','viewer','claim','source','issuer','verification','evidence','pending_verifications','history']) kk), 'explanation top-level keys');
  perform passport_test.check_true((select array_agg(k order by k collate "C") from jsonb_object_keys(r -> 'claim') k) = (select array_agg(kk order by kk collate "C") from unnest(array['id','claim_type','subject','status','effective_status','effective_at','expires_at','visibility','created_at','sensitivity','status_reason_code']) kk), 'explanation claim keys');
  perform passport_test.check_true((select array_agg(k order by k collate "C") from jsonb_object_keys(r -> 'verification') k) = (select array_agg(kk order by kk collate "C") from unnest(array['method','verifier','decided_at','expires_at','reason_code']) kk), 'explanation verification keys');
  perform passport_test.check_true(jsonb_array_length(r -> 'evidence') = 2, 'owner sees both pieces of evidence (as metadata)');
  perform passport_test.check_true((r -> 'evidence' -> 0 ->> 'evidence_type') is not null and (r -> 'evidence' -> 0 ->> 'artifact_count')::int = 1, 'evidence carries type + artifact COUNT');
  perform passport_test.check_true(r::text not like '%SECRET-PATH%' and r::text not like '%flow_storage%' and r::text not like '%license.pdf%', 'NO artifact reference or storage path appears anywhere');
  perform passport_test.check_true(r::text not like '%PRIVATE-NOTE%', 'NO evidence provenance / private note appears');
  perform passport_test.check_true((r -> 'verification' ->> 'method') = 'organization_verified' and (r -> 'verification' -> 'verifier' ->> 'label') = 'Buffalo Welding Guild', 'method + verifier (an org name) shown');
  perform passport_test.check_true((r -> 'verification' ->> 'reason_code') = 'documents_checked', 'the owner sees the decision''s reason code');
  perform passport_test.check_true((r -> 'source' ->> 'ref') = 'INTERNAL-REF-77', 'the owner sees the source reference');
  perform passport_test.check_true(jsonb_array_length(r -> 'history') = 2 and (r -> 'history' -> 0 ->> 'type') = 'claim.created', 'the owner sees what happened, in order');
  perform passport_test.check_true((r -> 'claim' ->> 'sensitivity') = 'standard', 'owner sees sensitivity');

  -- ── anonymous public viewer: only what a public claim warrants ──
  perform passport_test.as_anon();
  r := public.passport_claim_explanation(pub);
  perform passport_test.ok(r, 'a public claim of a public passport can be explained to anyone');
  perform passport_test.check_true((r ->> 'viewer') = 'public', 'viewer is public');
  perform passport_test.check_true((r -> 'evidence') = '{"count": 2}'::jsonb, 'the public sees ONLY how many pieces of evidence — not their kinds');
  perform passport_test.check_true((r -> 'verification' ->> 'method') = 'organization_verified' and (r -> 'verification' -> 'verifier' ->> 'label') = 'Buffalo Welding Guild', 'the public sees how it was verified and by which organization');
  perform passport_test.check_true((r -> 'verification' ->> 'reason_code') is null, 'reason code hidden from the public');
  perform passport_test.check_true((r -> 'source' ->> 'ref') is null, 'source reference hidden from the public');
  perform passport_test.check_true((r -> 'claim' ->> 'sensitivity') is null and (r -> 'claim' ->> 'status_reason_code') is null, 'internal fields hidden from the public');
  perform passport_test.check_true(jsonb_array_length(r -> 'history') = 0 and jsonb_array_length(r -> 'pending_verifications') = 0, 'no history or pending requests for the public');
  perform passport_test.check_true(r::text not like '%SECRET-PATH%' and r::text not like '%PRIVATE-NOTE%' and r::text not like '%documents_checked%' and r::text not like '%INTERNAL-REF%' and r::text not like '%CDL-A%', 'nothing private leaks to the public, including the claim value');

  -- the same for a signed-in stranger
  perform passport_test.as_user(x);
  perform passport_test.check_true((public.passport_claim_explanation(pub) ->> 'viewer') = 'public', 'a signed-in stranger gets the public view, no more');

  -- ── no oracle: private claim / nonexistent claim are indistinguishable ──
  perform passport_test.as_anon();
  nothing := public.passport_claim_explanation(gen_random_uuid());
  perform passport_test.denied(nothing, 'not_found', 'nonexistent claim');
  perform passport_test.check_true(public.passport_claim_explanation(priv) = nothing, 'a private claim looks exactly like a nonexistent one to anon');
  perform passport_test.as_user(x);
  perform passport_test.check_true(public.passport_claim_explanation(priv) = nothing, '... and to a stranger');

  -- ── an asked reviewer sees the claim under review, not the subject's whole history ──
  perform passport_test.as_user(peer);
  r := public.passport_claim_explanation(priv);
  perform passport_test.ok(r, 'the named peer can see what they were asked to verify');
  perform passport_test.check_true((r ->> 'viewer') = 'reviewer', 'viewer is a reviewer');
  perform passport_test.check_true(jsonb_array_length(r -> 'pending_verifications') = 1, 'the pending request is visible to the reviewer');
  perform passport_test.check_true(jsonb_array_length(r -> 'history') = 0, 'but not the subject''s audit history');
  perform passport_test.check_true((r -> 'source' ->> 'ref') is null, 'nor the internal source reference');
  -- being asked to review ONE claim grants nothing about the subject's other claims: the peer sees the
  -- public claim only through the public view (no evidence kinds, no history)
  r := public.passport_claim_explanation(pub);
  perform passport_test.check_true((r ->> 'viewer') = 'public' and (r -> 'evidence') = '{"count": 2}'::jsonb, 'the peer sees the OTHER claim only through the public view');
end $$;

-- ── M1 parity: explanation can never disclose what the canonical public projection hides ──
-- Two claims that are public + verified + unexpired on a public passport, but that
-- passport_public_claims() (the M1 boundary) deliberately rejects:
--   * a MANUAL claim: a member can write any title, so it is never a trusted public headline
--   * a SENSITIVE platform-derived claim
-- passport_claim_explanation() delegates its public branch to the projection, so both must be
-- indistinguishable from a nonexistent claim to anon and to a stranger.
select passport_test.reset();  -- the previous block ends impersonating a peer; fixtures are written as the owner role
insert into public.passport_claims (id, subject_type, subject_id, claim_type, value, issuer_kind, visibility, status, sensitivity, effective_at, source_system, created_by) values
  ('c3000000-0000-4000-8000-000000000003', 'person', 'a0000000-0000-4000-8000-000000000001', 'attestation.peer', '{"title":"Forged headline"}', 'subject', 'public', 'submitted', 'standard', now(), 'manual', 'a0000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000004', 'person', 'a0000000-0000-4000-8000-000000000001', 'attestation.peer', '{"title":"Sensitive detail"}', 'subject', 'public', 'submitted', 'sensitive', now(), 'flow_platform', 'a0000000-0000-4000-8000-000000000001');
insert into public.passport_verifications (claim_id, method, verifier_type, verifier_id, status, decision, reason_code, decided_at, decided_by) values
  ('c3000000-0000-4000-8000-000000000003', 'peer_attested', 'person', 'c0000000-0000-4000-8000-000000000003', 'completed', 'verified', 'known_personally', now(), 'c0000000-0000-4000-8000-000000000003'),
  ('c4000000-0000-4000-8000-000000000004', 'peer_attested', 'person', 'c0000000-0000-4000-8000-000000000003', 'completed', 'verified', 'known_personally', now(), 'c0000000-0000-4000-8000-000000000003');
update public.passport_claims set status = 'verified' where id in ('c3000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000004');

do $$
declare pub uuid := 'c1000000-0000-4000-8000-000000000001';
        manual_claim uuid := 'c3000000-0000-4000-8000-000000000003'; sensitive_claim uuid := 'c4000000-0000-4000-8000-000000000004';
        x uuid := 'd0000000-0000-4000-8000-000000000004'; nothing jsonb; c uuid;
begin
  perform passport_test.check_true((select status from public.passport_claims where id = manual_claim) = 'verified'
    and (select visibility from public.passport_claims where id = manual_claim) = 'public'
    and (select source_system from public.passport_claims where id = manual_claim) = 'manual', 'fixture: the manual claim is verified + public (only its source makes it ineligible)');

  perform passport_test.as_anon();
  nothing := public.passport_claim_explanation(gen_random_uuid());
  -- positive control: the claim the projection accepts is explained, and only that one
  perform passport_test.check_true((select count(*) from public.passport_public_claims(null, pub, 1)) = 1, 'control: the projection returns the platform-derived public claim');
  perform passport_test.check_true((public.passport_claim_explanation(pub) ->> 'viewer') = 'public', 'control: ... and the explanation serves it to the public');

  foreach c in array array[manual_claim, sensitive_claim] loop
    perform passport_test.as_anon();
    perform passport_test.check_true((select count(*) from public.passport_public_claims(null, c, 1)) = 0, 'the projection rejects this claim for anon');
    perform passport_test.check_true(public.passport_claim_explanation(c) = nothing, 'the explanation is byte-identical to a nonexistent claim for anon (no oracle, no weaker path)');
    perform passport_test.as_user(x);
    perform passport_test.check_true((select count(*) from public.passport_public_claims(null, c, 1)) = 0, 'the projection rejects this claim for a stranger');
    perform passport_test.check_true(public.passport_claim_explanation(c) = nothing, 'the explanation is byte-identical to a nonexistent claim for a stranger');
  end loop;

  -- the owner is unaffected: they can still ask why about their own manual claim
  perform passport_test.as_user('a0000000-0000-4000-8000-000000000001');
  perform passport_test.check_true((public.passport_claim_explanation(manual_claim) ->> 'viewer') = 'owner', 'the owner can still explain their own manual claim');
  perform passport_test.reset();
end $$;

do $$
declare r jsonb; pub uuid := 'c1000000-0000-4000-8000-000000000001'; priv uuid := 'c2000000-0000-4000-8000-000000000002';
        s uuid := 'a0000000-0000-4000-8000-000000000001'; adm uuid := 'f0000000-0000-4000-8000-000000000006';
begin
  -- ── admin: AAL2 only ──
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.denied(public.passport_claim_explanation(priv), 'not_found', 'an admin at AAL1 cannot explain a private claim');
  perform passport_test.as_user(adm, 'aal2');
  r := public.passport_claim_explanation(priv);
  perform passport_test.ok(r, 'an admin at AAL2 can');
  perform passport_test.check_true((r ->> 'viewer') = 'admin', 'viewer is admin');

  -- ── privacy switch: turning the passport private hides the public view ──
  perform passport_test.reset();
  update public.profiles set public_passport = false where id = s;
  perform passport_test.as_anon();
  perform passport_test.denied(public.passport_claim_explanation(pub), 'not_found', 'a private passport''s public claim is no longer explainable to strangers');
  perform passport_test.as_user(s);
  perform passport_test.ok(public.passport_claim_explanation(pub), 'the owner still can');
  perform passport_test.reset();
  update public.profiles set public_passport = true where id = s;

  -- ── expiry: an overdue public claim is not public, and the owner sees it as expired ──
  alter table public.passport_claims disable trigger passport_claims_guard_trg;
  update public.passport_claims set effective_at = now() - interval '30 days', expires_at = now() - interval '1 day' where id = pub;
  alter table public.passport_claims enable trigger passport_claims_guard_trg;
  perform passport_test.as_anon();
  perform passport_test.denied(public.passport_claim_explanation(pub), 'not_found', 'an expired claim is not publicly explainable');
  perform passport_test.as_user(s);
  r := public.passport_claim_explanation(pub);
  perform passport_test.check_true((r -> 'claim' ->> 'status') = 'verified' and (r -> 'claim' ->> 'effective_status') = 'expired', 'the owner sees it has expired, even before any sweep ran');
  perform passport_test.reset();
end $$;

-- ── the real-data path: an activity-derived claim explains itself honestly ──
do $$
declare r jsonb; host uuid := 'b0000000-0000-4000-8000-000000000002'; s uuid := 'a0000000-0000-4000-8000-000000000001';
        act uuid := 'aa000000-0000-4000-8000-0000000000aa'; cl uuid;
begin
  insert into public.activities (id, created_by, title, activity_type, status) values (act, host, 'Welding workshop', 'workshop', 'published');
  perform passport_test.as_user(s);
  insert into public.activity_participants (activity_id, profile_id) values (act, s);
  perform passport_test.as_user(host);
  perform passport_test.ok(public.check_in_activity_participant(act, s), 'check in');
  perform passport_test.ok(public.complete_activity_participant(act, s), 'complete');
  perform passport_test.as_user(s);
  cl := (public.passport_claim_from_activity(act) ->> 'id')::uuid;
  r := public.passport_claim_explanation(cl);
  perform passport_test.ok(r, 'the participant can ask why their activity claim exists');
  perform passport_test.check_true((r -> 'verification' ->> 'method') = 'platform_verified' and (r -> 'verification' -> 'verifier' ->> 'kind') = 'system' and (r -> 'verification' -> 'verifier' ->> 'label') = 'Flow', 'verified by Flow from the source record — not by an admin or a peer');
  perform passport_test.check_true((r -> 'verification' ->> 'reason_code') = 'source_record', 'the reason says: source record');
  perform passport_test.check_true((r -> 'issuer' ->> 'kind') = 'entity' and (r -> 'issuer' ->> 'label') is not null, 'the issuer (the host) is named to the owner');
  perform passport_test.check_true((r -> 'evidence' -> 0 ->> 'source_kind') = 'flow_activity' and (r -> 'evidence' -> 0 ->> 'artifact_count')::int = 0, 'the evidence is the Flow activity record, with no artifacts');
  -- make it public: the public view names the ORGANIZATION issuer only; a person host stays unnamed
  perform passport_test.ok(public.passport_set_claim_visibility(cl, 'public'), 'owner makes it public');
  perform passport_test.as_anon();
  r := public.passport_claim_explanation(cl);
  perform passport_test.ok(r, 'the public can see why');
  perform passport_test.check_true((r -> 'issuer' ->> 'label') is null, 'a person issuer is not named to the public');
  perform passport_test.check_true((r -> 'claim' ->> 'claim_type') = 'participation.activity', 'the public sees the claim type');
  perform passport_test.reset();
end $$;

-- ── hygiene ─────────────────────────────────────────────────────────────
do $$
begin
  perform passport_test.check_true(not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'passport_claim_explanation'
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))), 'passport_claim_explanation is SECURITY DEFINER with a pinned search_path');
end $$;

rollback;
select 'passport_v2_explanation: all assertions passed' as result;
