-- The previous migration revoked is_blocked_between from both anon and
-- authenticated, which broke the profiles_block_restrict RESTRICTIVE policy
-- for everyone: Postgres requires the *calling* role to hold EXECUTE on any
-- function referenced in an RLS policy, even a SECURITY DEFINER one — the
-- privilege check happens at the call site, not just inside the function
-- body. Restoring execute for both roles so profile reads keep working.
grant execute on function public.is_blocked_between(uuid, uuid) to anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
