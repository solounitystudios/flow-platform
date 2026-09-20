-- Shared helpers for tests/db/*.test.sql. tests/db/replay.sh concatenates this
-- file ahead of every test, so each test runs in ONE transaction (opened here)
-- that the test itself rolls back. Impersonation sets the same settings
-- PostgREST sets (request.jwt.claim.sub / request.jwt.claims) and switches to
-- the real anon/authenticated/service_role database roles.
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
