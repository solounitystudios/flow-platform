revoke all on function public.handle_new_user() from public, anon, authenticated;
alter view public.passport_summary set (security_invoker = true);
