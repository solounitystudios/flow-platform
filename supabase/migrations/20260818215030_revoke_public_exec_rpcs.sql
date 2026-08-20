-- REVOKE ... FROM anon alone was a no-op for these: Postgres grants EXECUTE to
-- PUBLIC by default at function-creation time, and anon inherits through that,
-- not through a direct grant. Confirmed via pg_proc.proacl (send_connection_request
-- still carried a bare "=X/postgres" PUBLIC entry after the earlier "revoke from
-- anon" migration). check_in_ticket/redeem_reward never had this problem because
-- their PUBLIC grant was already absent from creation. Revoking from PUBLIC here
-- actually closes the gap; authenticated keeps its own direct grant either way.
revoke execute on function public.send_connection_request(uuid) from public;
revoke execute on function public.respond_to_connection_request(uuid, text) from public;
revoke execute on function public.cancel_connection_request(uuid) from public;
revoke execute on function public.remove_connection(uuid) from public;
revoke execute on function public.block_profile(uuid) from public;
revoke execute on function public.unblock_profile(uuid) from public;
revoke execute on function public.report_profile(uuid, text, text) from public;
revoke execute on function public.get_my_blocked_profiles() from public;

revoke execute on function public.get_or_create_direct_conversation(uuid) from public;
revoke execute on function public.get_or_create_event_conversation(uuid) from public;
revoke execute on function public.get_or_create_opportunity_conversation(uuid, uuid) from public;
revoke execute on function public.send_message(uuid, text) from public;
revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.delete_message(uuid) from public;

-- is_blocked_between deliberately keeps its PUBLIC grant — it must stay
-- callable by anon so the RESTRICTIVE policy on profiles still evaluates
-- correctly for anonymous (logged-out) profile browsing.
