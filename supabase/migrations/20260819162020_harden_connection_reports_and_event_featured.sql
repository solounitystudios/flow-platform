-- Security fix batch (two independently-scoped gaps, no other object touched):
--
-- 1. connection_reports_read only checked for *any* row in public.admins,
--    ignoring the admins.active flag and AAL2 requirement that every other
--    admin-gated policy in this repo already enforces via
--    public.is_flow_admin(true) (see admin_employer_outreach_mvp.sql and
--    v1plus_passport_trust_matching.sql). Deactivated admins and admins who
--    haven't completed MFA could still read moderation reports. Fixed by
--    routing the admin branch through is_flow_admin(true) — the
--    reporter-self-read branch is untouched.
--
-- 2. events.featured had no guard at all beyond the blanket
--    events_creator_manage `for all` policy, so any event's own creator
--    could set featured = true on themselves via a direct client update.
--    Fixed with a BEFORE INSERT OR UPDATE trigger (not RLS with check,
--    since with check can't distinguish "featured is unchanged" from
--    "featured was just set" on the whole NEW row, which would incorrectly
--    block a creator from editing an already-admin-featured event) that
--    rejects any attempt to set/change featured unless the caller is an
--    active, AAL2 admin. Every other column stays fully creator-managed
--    through the existing events_creator_manage policy. This follows the
--    repo's established convention (enforce_attendance_lifecycle) of
--    raising an exception on an unauthorized transition rather than
--    silently dropping a column.

-- ── Gap 1: connection_reports_read onto is_flow_admin(true) ────────────────

drop policy if exists connection_reports_read on public.connection_reports;
create policy connection_reports_read
  on public.connection_reports for select
  using (
    (select auth.uid()) = reporter_id
    or public.is_flow_admin(true)
  );

-- ── Gap 2: events.featured locked to admins only ────────────────────────────

create or replace function public.enforce_event_featured_admin_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.featured and not public.is_flow_admin(true) then
      raise exception 'Only a FLOW admin can feature an event.';
    end if;
    return new;
  end if;

  -- tg_op = 'UPDATE': only intervene when featured is actually changing, so
  -- a creator editing any other column of an already-featured event (set by
  -- an admin) is never blocked by this guard.
  if new.featured is distinct from old.featured and not public.is_flow_admin(true) then
    raise exception 'Only a FLOW admin can change an event''s featured status.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_event_featured_admin_only() from public, anon, authenticated;

drop trigger if exists trg_enforce_event_featured_admin_only on public.events;
create trigger trg_enforce_event_featured_admin_only
  before insert or update on public.events
  for each row execute function public.enforce_event_featured_admin_only();
