-- Local-replay shims for a vanilla supabase/postgres image. The hosted
-- Supabase project provides auth.jwt() via GoTrue's migrations; the bare
-- image only ships auth.uid()/role()/email(). Nothing here is applied to any
-- real project — this file is only ever piped into the throwaway container
-- started by tests/db/replay.sh.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
