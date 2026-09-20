-- Passport V2: who may READ integration connection state (the Connections Center's data).
-- (helpers prepended by tests/db/replay.sh; this file ends by rolling back)
--
-- This suite adds NO behaviour and changes NO policy. It pins the read boundary the Connections
-- Center relies on, including the branch the gateway suite cannot reach: connections OWNED by a
-- subject (the gateway itself only ever creates platform-level rows).
--
-- P a person who owns a connection · X a stranger · OWN owner of Org One · MEM an org admin-ROLE member
-- ADM platform admin (AAL1 vs AAL2)

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'p@test.local'),
  ('b0000000-0000-4000-8000-000000000002', 'x@test.local'),
  ('c0000000-0000-4000-8000-000000000003', 'own@test.local'),
  ('e0000000-0000-4000-8000-000000000005', 'mem@test.local'),
  ('f0000000-0000-4000-8000-000000000006', 'adm@test.local');
insert into public.organizations (id, owner_id, name) values ('01000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Org One');
insert into public.organization_members (organization_id, profile_id, role, status) values ('01000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005', 'admin', 'active');
insert into public.admins (profile_id, role, active) values ('f0000000-0000-4000-8000-000000000006', 'admin', true);

-- an owned connection per owner kind, one already unhealthy
insert into public.passport_integration_connections (connector_key, owner_type, owner_id, status, scope, last_attempt_at, last_error_category) values
  ('flow_capture', 'person', 'a0000000-0000-4000-8000-000000000001', 'degraded', array['evidence:read'], now(), 'network'),
  ('flow_capture', 'organization', '01000000-0000-4000-8000-000000000001', 'healthy', array['evidence:read'], now(), null);

-- the gateway records a platform-level connection (this is the only kind it ever creates)
do $$
begin
  perform passport_test.as_service();
  perform passport_test.check_true((public.passport_gateway_record_connection_result('flow_capture', true) ->> 'status') = 'healthy', 'gateway records platform contact');
  perform passport_test.reset();
end $$;

do $$
declare p uuid := 'a0000000-0000-4000-8000-000000000001'; x uuid := 'b0000000-0000-4000-8000-000000000002';
        own uuid := 'c0000000-0000-4000-8000-000000000003'; mem uuid := 'e0000000-0000-4000-8000-000000000005';
        adm uuid := 'f0000000-0000-4000-8000-000000000006';
begin
  -- the gateway never touches an owned connection, and does not add one
  perform passport_test.check_true((select count(*) from public.passport_integration_connections) = 3, 'platform row was added beside the two owned rows');
  perform passport_test.check_true((select status from public.passport_integration_connections where owner_id = p) = 'degraded', 'a gateway success does not rewrite an owned connection');

  -- a person sees ONLY the connection they own — never the platform one, never someone else's
  perform passport_test.as_user(p);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 1, 'a person sees exactly their own connection');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections where owner_id is null') = 0, 'not the platform-level connection');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections where owner_type = ''organization''') = 0, 'not an organization''s connection');

  -- a stranger sees nothing
  perform passport_test.as_user(x);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 0, 'a stranger sees no connections');

  -- an organization''s connection is visible to the org OWNER, not to a member who merely has the admin ROLE
  perform passport_test.as_user(own);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 1, 'the org owner sees the org''s connection');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections where owner_type = ''organization''') = 1, '... and it is the org''s');
  perform passport_test.as_user(mem);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 0, 'an org admin-ROLE member is not an owner: role is not authority');

  -- a platform admin needs AAL2
  perform passport_test.as_user(adm, 'aal1');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 0, 'admin at AAL1 sees nothing');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_integration_connections') = 3, 'admin at AAL2 sees every connection');

  -- health EVENTS describe the integration, not a person: no subject, so only an AAL2 admin can read them
  perform passport_test.reset();
  perform passport_test.check_true((select count(*) from public.passport_events where event_type like 'integration.%') >= 1, 'the platform contact left an integration event');
  perform passport_test.as_user(p);
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events where event_type like ''integration.%''') = 0, 'a connection owner cannot read platform integration events');
  perform passport_test.as_user(adm, 'aal2');
  perform passport_test.check_true(passport_test.count_of('select count(*) from public.passport_events where event_type like ''integration.%'' and actor_id = ''flow_capture''') >= 1, 'an AAL2 admin can read them, filtered by connector');

  -- no client can write, and anon cannot even read
  perform passport_test.as_user(p);
  perform passport_test.raises('update public.passport_integration_connections set status = ''healthy''', 'no client can edit a connection');
  perform passport_test.raises('insert into public.passport_integration_connections (connector_key) values (''x_fake'')', 'no client can create a connection');
  perform passport_test.raises('delete from public.passport_integration_connections', 'no client can delete a connection');
  perform passport_test.as_anon();
  perform passport_test.raises('select count(*) from public.passport_integration_connections', 'anon has no read access to connections');
  perform passport_test.reset();
end $$;

rollback;
select 'passport_v2_connections_read: all assertions passed' as result;
