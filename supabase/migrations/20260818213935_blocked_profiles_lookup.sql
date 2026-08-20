-- The profiles_block_restrict policy is intentionally symmetric (neither
-- party can see the other's profile once blocked), but the blocker still
-- needs to see who they blocked to manage/unblock them. This RPC is the one
-- narrow, safe exception: it only ever returns rows the caller themselves
-- blocked.
create or replace function public.get_my_blocked_profiles()
returns table (
  connection_id uuid,
  profile_id uuid,
  full_name text,
  avatar_url text,
  username text,
  city text,
  state text,
  blocked_at timestamptz
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select
    c.id,
    p.id,
    p.full_name,
    p.avatar_url,
    p.username,
    p.city,
    p.state,
    c.updated_at
  from public.connections c
  join public.profiles p on p.id = (case when c.requester_id = auth.uid() then c.recipient_id else c.requester_id end)
  where c.status = 'blocked' and c.blocked_by = auth.uid();
$$;

revoke execute on function public.get_my_blocked_profiles() from anon;
