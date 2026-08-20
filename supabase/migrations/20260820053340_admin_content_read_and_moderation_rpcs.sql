-- FLOW Admin Content Control Center — Batch 1A.
--
-- Small, additive first step toward an admin listing/moderation surface for
-- opportunities and events. Two gaps closed here, nothing else:
--
--   1. opportunities_public_read / events_public_read (see
--      20260819092724_rls_performance_hardening.sql) read
--      `status <> 'draft' or (select auth.uid()) = created_by` — an admin
--      who is neither the creator nor viewing a non-draft row currently
--      cannot see the row at all, including through an admin UI. This adds
--      one new *permissive* SELECT policy per table gated on
--      `public.is_flow_admin(true)`. Postgres OR-combines multiple
--      permissive policies for the same command, so this can only ever
--      *add* visibility for active AAL2 admins — it does not alter or
--      narrow the existing owner-or-published policy at all.
--
--   2. Neither table has an admin write path — `opportunities_creator_manage`
--      / `events_creator_manage` are owner-only `for all` policies. This
--      adds one narrow SECURITY DEFINER RPC per table
--      (admin_set_opportunity_status / admin_set_event_status) that lets an
--      admin change only the `status` column of a single row. No new status
--      values are introduced — the existing `check` constraints on
--      `opportunities.status` ('draft','open','filled','completed',
--      'cancelled') and `events.status` ('draft','published','cancelled',
--      'completed') are left untouched and do the validation; an illegal
--      p_status simply fails the update via that constraint. Every call is
--      recorded into public.admin_audit_log, mirroring the manual-insert
--      shape already used by import_business_leads() in
--      20260819061906_admin_batch2_operations.sql.
--
-- Explicitly out of scope for this migration (do not extend it here):
-- connection_reports, events.featured, any broader status-lifecycle
-- migration, payments, the map. Those are separate, already-tracked work.
--
-- Rollback: both new policies can be dropped independently
-- (`drop policy opportunities_admin_read on public.opportunities;` /
-- same for events) without affecting any other policy, since they are
-- additive permissive grants, not replacements. Both new functions can be
-- dropped independently
-- (`drop function public.admin_set_opportunity_status(uuid, text);` /
-- same for events) with no dependents, since nothing else in this batch
-- calls them.

-- ── opportunities: admin read (additive permissive SELECT) ───────────────

create policy opportunities_admin_read on public.opportunities for select
  using (public.is_flow_admin(true));

-- ── events: admin read (additive permissive SELECT) ───────────────────────

create policy events_admin_read on public.events for select
  using (public.is_flow_admin(true));

-- ── opportunities: admin status moderation RPC ────────────────────────────
-- Only touches public.opportunities.status for the single targeted row.
-- Legal values are enforced entirely by the table's existing check
-- constraint (opportunities_status_check) — not duplicated here. Deliberately
-- does not replicate applicant-notification side effects by hand — the
-- existing on_opportunity_cancelled() AFTER UPDATE trigger
-- (20260818141345_phase2_opportunity_lifecycle.sql) fires regardless of
-- which statement performs the UPDATE, so an admin-driven cancellation
-- still notifies affected applicants automatically.

create or replace function public.admin_set_opportunity_status(p_opportunity_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_old_status text;
begin
  if not public.is_flow_admin(true) then
    raise exception 'Not authorized.';
  end if;

  select status into v_old_status from public.opportunities where id = p_opportunity_id for update;
  if not found then
    raise exception 'Opportunity not found.';
  end if;

  update public.opportunities set status = p_status where id = p_opportunity_id;

  insert into public.admin_audit_log(actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), 'admin_set_status', 'opportunities', p_opportunity_id::text,
    jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('ok', true, 'previous_status', v_old_status, 'status', p_status);
end;
$$;

revoke execute on function public.admin_set_opportunity_status(uuid, text) from public, anon;
grant execute on function public.admin_set_opportunity_status(uuid, text) to authenticated;

-- ── events: admin status moderation RPC ───────────────────────────────────
-- Only touches public.events.status for the single targeted row. Legal
-- values are enforced entirely by the table's existing check constraint
-- (events_status_check) — not duplicated here. Deliberately does not
-- replicate the cancellation-notification side effects that changing
-- events.status through the app already triggers via on_event_updated()
-- (20260818153046_phase3_events_tickets.sql) — that trigger fires
-- regardless of which statement performs the UPDATE, so attendee
-- notifications on an admin-driven cancellation still fire automatically.

create or replace function public.admin_set_event_status(p_event_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_old_status text;
begin
  if not public.is_flow_admin(true) then
    raise exception 'Not authorized.';
  end if;

  select status into v_old_status from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found.';
  end if;

  update public.events set status = p_status where id = p_event_id;

  insert into public.admin_audit_log(actor_id, action, table_name, record_id, old_data, new_data)
  values (
    auth.uid(), 'admin_set_status', 'events', p_event_id::text,
    jsonb_build_object('status', v_old_status), jsonb_build_object('status', p_status)
  );

  return jsonb_build_object('ok', true, 'previous_status', v_old_status, 'status', p_status);
end;
$$;

revoke execute on function public.admin_set_event_status(uuid, text) from public, anon;
grant execute on function public.admin_set_event_status(uuid, text) to authenticated;
