-- FLOW Admin Operations Batch 2: lead lifecycle, pipeline board,
-- CSV import, verification decision history, and on-demand
-- onboarding follow-up task generation.
--
-- Every new write path funnels through either a SECURITY DEFINER RPC
-- (change_lead_stage, import_business_leads, decide_verification_case,
-- generate_onboarding_followup_tasks — all authorize via is_flow_admin(true)
-- inline, fixed search_path, revoked from PUBLIC/anon, granted only to
-- authenticated) or a direct table write still gated by each table's
-- existing is_flow_admin(true) RLS policy — the app layer never becomes
-- the source of authorization. No cron job is created here: pg_cron is
-- available on this project but not installed/configured, and there is
-- no existing tested scheduler in this app, so onboarding-followup
-- generation stays an on-demand admin action (see AGENTS report).

-- ── business_leads: archive lifecycle (never a hard delete) ──────────────

alter table public.business_leads add column if not exists archived boolean not null default false;
alter table public.business_leads add column if not exists archived_at timestamptz;
alter table public.business_leads add column if not exists archived_reason text;
alter table public.business_leads add column if not exists archived_by uuid references public.profiles(id) on delete set null;

create index if not exists business_leads_archived_idx on public.business_leads (archived);

-- ── lead_stage_history: the only record of pipeline movement ─────────────
-- No client insert/update/delete policy — the sole write path is
-- change_lead_stage() below, so every stage change (from the lead detail
-- page or the pipeline board) is both validated and recorded atomically.

create table public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.business_leads(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid not null default auth.uid() references public.profiles(id),
  changed_at timestamptz not null default now(),
  note text
);

create index lead_stage_history_lead_idx on public.lead_stage_history (lead_id, changed_at desc);

alter table public.lead_stage_history enable row level security;
create policy lead_stage_history_admin_read on public.lead_stage_history for select
  using (public.is_flow_admin(true));

create or replace function public.change_lead_stage(p_lead_id uuid, p_new_stage text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_old_stage text;
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select pipeline_stage into v_old_stage from public.business_leads where id = p_lead_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.business_leads set pipeline_stage = p_new_stage where id = p_lead_id;

  insert into public.lead_stage_history(lead_id, from_stage, to_stage, changed_by, note)
  values (p_lead_id, v_old_stage, p_new_stage, auth.uid(), p_note);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.change_lead_stage(uuid, text, text) from public;
grant execute on function public.change_lead_stage(uuid, text, text) to authenticated;

-- ── outreach_tasks: reschedule/reopen support + auto-generation markers ──

alter table public.outreach_tasks add column if not exists auto_generated boolean not null default false;
alter table public.outreach_tasks add column if not exists trigger_key text;

-- Prevents generate_onboarding_followup_tasks() from creating duplicate
-- open tasks for the same lead+reason on repeated runs; manual tasks
-- (trigger_key null) are unrestricted.
create unique index if not exists outreach_tasks_trigger_key_open_idx
  on public.outreach_tasks (lead_id, trigger_key)
  where status = 'open' and trigger_key is not null;

-- ── employer_invitations: track "replace an expired invitation" lineage ──

alter table public.employer_invitations add column if not exists replaces_invitation_id uuid references public.employer_invitations(id) on delete set null;

-- ── CSV import: single SECURITY DEFINER RPC, one call per confirmed batch ─
-- The preview step (parsing, normalization, required-field validation,
-- duplicate detection) happens entirely in the Server Action before this
-- is ever called — this function only executes the admin's final,
-- explicit per-row decisions (create vs. update-existing), inside one
-- function invocation so a failure partway through aborts the whole
-- batch rather than leaving a half-applied import. Never touches
-- public.organizations. Capped at 500 rows — also enforced client-side.

create or replace function public.import_business_leads(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_row jsonb;
  v_created int := 0;
  v_updated int := 0;
  v_lead_id uuid;
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_batch');
  end if;

  if jsonb_array_length(p_rows) > 500 then
    return jsonb_build_object('ok', false, 'reason', 'batch_too_large');
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if v_row ->> 'action' = 'update' and (v_row ->> 'existing_id') is not null then
      update public.business_leads set
        business_name = coalesce(nullif(v_row ->> 'business_name', ''), business_name),
        category = coalesce(nullif(v_row ->> 'category', ''), category),
        address = nullif(v_row ->> 'address', ''),
        neighborhood = nullif(v_row ->> 'neighborhood', ''),
        city = coalesce(nullif(v_row ->> 'city', ''), city),
        region = coalesce(nullif(v_row ->> 'state', ''), region),
        postal_code = nullif(v_row ->> 'postal_code', ''),
        website_url = nullif(v_row ->> 'website', ''),
        social_url = nullif(v_row ->> 'social_url', ''),
        general_email = nullif(v_row ->> 'email', ''),
        general_phone = nullif(v_row ->> 'phone', ''),
        staffing_problems = nullif(v_row ->> 'staffing_problems', ''),
        typical_roles = case when nullif(v_row ->> 'typical_roles', '') is not null
          then string_to_array(v_row ->> 'typical_roles', '|') else typical_roles end,
        hiring_frequency = nullif(v_row ->> 'hiring_frequency', ''),
        best_contact_method = nullif(v_row ->> 'best_contact_method', ''),
        source = coalesce(nullif(v_row ->> 'source', ''), source),
        consent_notes = coalesce(nullif(v_row ->> 'consent_status', ''), consent_notes),
        notes = coalesce(nullif(v_row ->> 'notes', ''), notes)
      where id = (v_row ->> 'existing_id')::uuid;
      if found then v_updated := v_updated + 1; end if;
    else
      insert into public.business_leads(
        business_name, category, address, neighborhood, city, region, postal_code,
        website_url, social_url, general_email, general_phone, staffing_problems,
        typical_roles, hiring_frequency, best_contact_method, source, consent_notes, created_by
      ) values (
        v_row ->> 'business_name', v_row ->> 'category', nullif(v_row ->> 'address', ''), nullif(v_row ->> 'neighborhood', ''),
        coalesce(nullif(v_row ->> 'city', ''), 'Buffalo'), coalesce(nullif(v_row ->> 'state', ''), 'NY'), nullif(v_row ->> 'postal_code', ''),
        nullif(v_row ->> 'website', ''), nullif(v_row ->> 'social_url', ''), nullif(v_row ->> 'email', ''), nullif(v_row ->> 'phone', ''),
        nullif(v_row ->> 'staffing_problems', ''),
        case when nullif(v_row ->> 'typical_roles', '') is not null
          then string_to_array(v_row ->> 'typical_roles', '|') else '{}' end,
        nullif(v_row ->> 'hiring_frequency', ''), nullif(v_row ->> 'best_contact_method', ''),
        nullif(v_row ->> 'source', ''), nullif(v_row ->> 'consent_status', ''),
        auth.uid()
      )
      returning id into v_lead_id;
      v_created := v_created + 1;

      if nullif(v_row ->> 'decision_maker', '') is not null then
        insert into public.business_contacts(lead_id, full_name, title, email, phone, is_decision_maker)
        values (v_lead_id, v_row ->> 'decision_maker', nullif(v_row ->> 'contact_title', ''), nullif(v_row ->> 'email', ''), nullif(v_row ->> 'phone', ''), true);
      end if;
    end if;
  end loop;

  insert into public.admin_audit_log(actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'import', 'business_leads', null, jsonb_build_object('created', v_created, 'updated', v_updated));

  return jsonb_build_object('ok', true, 'created', v_created, 'updated', v_updated);
end;
$$;

revoke all on function public.import_business_leads(jsonb) from public;
grant execute on function public.import_business_leads(jsonb) to authenticated;

-- ── organization_verification_cases: decision workflow + history ─────────

alter table public.organization_verification_cases drop constraint if exists organization_verification_cases_status_check;
alter table public.organization_verification_cases add constraint organization_verification_cases_status_check
  check (status in ('pending','in_review','information_requested','approved','rejected','closed','suspicious_duplicate','suspended'));

alter table public.organization_verification_cases add column if not exists decision_reason_code text;
alter table public.organization_verification_cases drop constraint if exists organization_verification_cases_reason_code_check;
alter table public.organization_verification_cases add constraint organization_verification_cases_reason_code_check
  check (decision_reason_code is null or decision_reason_code in (
    'incomplete_documentation','unverifiable_address','duplicate_listing','suspected_fraud',
    'domain_mismatch','license_missing','identity_confirmed','address_confirmed','domain_confirmed','other'
  ));

-- Append-only; the only write path is decide_verification_case() below, so
-- a full decision history always matches what actually happened to the
-- case's status, never something the app forgot to log.
create table public.verification_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.organization_verification_cases(id) on delete cascade,
  actor_id uuid not null default auth.uid() references public.profiles(id),
  from_status text,
  to_status text not null,
  reason_code text,
  notes text,
  created_at timestamptz not null default now()
);

create index verification_decisions_case_idx on public.verification_decisions (case_id, created_at desc);

alter table public.verification_decisions enable row level security;
create policy verification_decisions_admin_read on public.verification_decisions for select
  using (public.is_flow_admin(true));

-- Approving a case advances the linked lead's pipeline stage to
-- organization_verified — but only forward, never overwriting a lead
-- that's already progressed further (e.g. already posted an opportunity).
-- This never touches public.organizations.verified or its RLS: that flag
-- belongs to a separate, deliberate marketplace-verification step outside
-- this admin tool, unchanged by this migration.
create or replace function public.decide_verification_case(
  p_case_id uuid, p_new_status text, p_reason_code text default null, p_notes text default null, p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_old_status text; v_lead_id uuid; v_stage text;
declare v_order text[] := array['identified','researched','contact_attempted','decision_maker_reached','demo_scheduled','demo_completed',
  'pilot_offered','pilot_accepted','onboarding_started','organization_verified','first_opportunity_posted',
  'first_opportunity_completed','repeat_employer'];
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select status, lead_id into v_old_status, v_lead_id from public.organization_verification_cases where id = p_case_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  update public.organization_verification_cases set
    status = p_new_status,
    decision_reason = coalesce(p_notes, decision_reason),
    decision_reason_code = coalesce(p_reason_code, decision_reason_code),
    assigned_to = coalesce(p_assigned_to, assigned_to),
    decided_by = case when p_new_status in ('approved','rejected') then auth.uid() else decided_by end,
    decided_at = case when p_new_status in ('approved','rejected') then now() else decided_at end
  where id = p_case_id;

  insert into public.verification_decisions(case_id, actor_id, from_status, to_status, reason_code, notes)
  values (p_case_id, auth.uid(), v_old_status, p_new_status, p_reason_code, p_notes);

  if p_new_status = 'approved' and v_lead_id is not null then
    select pipeline_stage into v_stage from public.business_leads where id = v_lead_id;
    if v_stage is not null
      and array_position(v_order, v_stage) is not null
      and array_position(v_order, v_stage) < array_position(v_order, 'organization_verified')
    then
      perform public.change_lead_stage(v_lead_id, 'organization_verified', 'Auto-advanced: verification case approved');
    end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.decide_verification_case(uuid, text, text, text, uuid) from public;
grant execute on function public.decide_verification_case(uuid, text, text, text, uuid) to authenticated;

-- ── on-demand onboarding follow-up generation (no cron — see AGENTS report) ─
-- Scans for three stalled-onboarding conditions and opens (at most one
-- open, deduplicated-by-trigger_key) outreach_task per lead per
-- condition. Triggered by an admin clicking "Generate follow-ups" on
-- /admin/tasks — there is no scheduled/automatic invocation.

create or replace function public.generate_onboarding_followup_tasks()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_created int := 0; v_rec record;
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  -- 1) Invitation accepted, no organization created within 3 days.
  for v_rec in
    select i.lead_id, bl.business_name
    from public.employer_invitations i
    join public.business_leads bl on bl.id = i.lead_id
    where i.accepted_at is not null
      and i.accepted_at < now() - interval '3 days'
      and i.revoked_at is null
      and not exists (select 1 from public.lead_organization_links l where l.lead_id = i.lead_id)
      and not bl.archived
  loop
    insert into public.outreach_tasks(lead_id, title, details, task_type, due_at, status, auto_generated, trigger_key)
    values (v_rec.lead_id, 'Invitation accepted, no organization yet',
      v_rec.business_name || ' accepted their invitation over 3 days ago but hasn''t created an organization yet.',
      'onboarding', now(), 'open', true, 'no_org_after_accept')
    on conflict (lead_id, trigger_key) where status = 'open' and trigger_key is not null do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  -- 2) Organization created, verification not resolved within 5 days.
  for v_rec in
    select l.lead_id, bl.business_name
    from public.lead_organization_links l
    join public.business_leads bl on bl.id = l.lead_id
    join public.organization_verification_cases c on c.lead_id = l.lead_id
    where c.status not in ('approved','rejected','closed')
      and c.created_at < now() - interval '5 days'
      and not bl.archived
  loop
    insert into public.outreach_tasks(lead_id, title, details, task_type, due_at, status, auto_generated, trigger_key)
    values (v_rec.lead_id, 'Verification stalled',
      v_rec.business_name || '''s verification case has been open for over 5 days.',
      'verification', now(), 'open', true, 'verification_stalled')
    on conflict (lead_id, trigger_key) where status = 'open' and trigger_key is not null do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  -- 3) Verified, no first opportunity posted within 7 days of approval.
  for v_rec in
    select l.lead_id, bl.business_name
    from public.lead_organization_links l
    join public.business_leads bl on bl.id = l.lead_id
    join public.organization_verification_cases c on c.lead_id = l.lead_id and c.status = 'approved'
    where c.decided_at < now() - interval '7 days'
      and not exists (select 1 from public.opportunities o where o.organization_id = l.organization_id)
      and not bl.archived
  loop
    insert into public.outreach_tasks(lead_id, title, details, task_type, due_at, status, auto_generated, trigger_key)
    values (v_rec.lead_id, 'No first opportunity posted yet',
      v_rec.business_name || ' was verified over 7 days ago but hasn''t posted an opportunity.',
      'onboarding', now(), 'open', true, 'no_first_opportunity')
    on conflict (lead_id, trigger_key) where status = 'open' and trigger_key is not null do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'created', v_created);
end;
$$;

revoke all on function public.generate_onboarding_followup_tasks() from public;
grant execute on function public.generate_onboarding_followup_tasks() to authenticated;
