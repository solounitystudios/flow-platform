revoke execute on function public.send_connection_request(uuid) from anon;
revoke execute on function public.respond_to_connection_request(uuid, text) from anon;
revoke execute on function public.cancel_connection_request(uuid) from anon;
revoke execute on function public.remove_connection(uuid) from anon;
revoke execute on function public.block_profile(uuid) from anon;
revoke execute on function public.unblock_profile(uuid) from anon;
revoke execute on function public.report_profile(uuid, text, text) from anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from authenticated;
