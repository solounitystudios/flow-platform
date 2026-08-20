-- Lock down internal SECURITY DEFINER functions: they must only ever run via
-- triggers (which don't need EXECUTE grants), never be callable directly through
-- PostgREST RPC by anon/authenticated — otherwise anyone could spoof notifications
-- to arbitrary users, or force reliability recomputation on demand.
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.recompute_reliability(uuid) from public, anon, authenticated;
revoke execute on function public.enforce_application_lifecycle() from public, anon, authenticated;
revoke execute on function public.on_application_inserted() from public, anon, authenticated;
revoke execute on function public.on_application_updated() from public, anon, authenticated;
revoke execute on function public.on_opportunity_cancelled() from public, anon, authenticated;
revoke execute on function public.on_recommendation_created() from public, anon, authenticated;

-- passport_summary was created security_invoker=true, which means anyone viewing
-- ANOTHER person's public Passport gets under-counted gigs_completed/events_attended,
-- since applications/event_attendance rows are only RLS-visible to their two parties.
-- A Passport that only tells the truth to its owner defeats the point of a public,
-- shareable credential. Individual application/attendance ROWS stay private (RLS is
-- unchanged); only this aggregate, counts-only view is made to bypass RLS, the same
-- way reliability_breakdown intentionally does. Neither view exposes raw rows.
alter view public.passport_summary set (security_invoker = false);

comment on view public.passport_summary is
  'Public aggregate Passport stats. Deliberately not security_invoker: counts must be accurate for any viewer, not just the profile owner. Only exposes aggregates, never raw application/attendance rows.';
comment on view public.reliability_breakdown is
  'Public, transparent reliability factors (see recompute_reliability() for the formula). Deliberately not security_invoker, for the same reason as passport_summary.';
