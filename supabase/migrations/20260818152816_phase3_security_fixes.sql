-- ============================================================
-- PHASE 3a: security fixes uncovered while building the events/
-- points system (found during the "review RLS carefully" pass)
-- ============================================================

-- BUG 1: event_attendance's only write policy was a blanket
-- "ALL using(auth.uid()=profile_id)" — a user could PATCH their own
-- row to status='attended' directly, self-marking attendance with
-- no check-in ever happening. Replace with insert + narrow self-cancel;
-- the 'attended'/'no_show' transitions are added in the next migration,
-- gated by ownership checks in a trigger (mirrors the Phase 2 applications
-- pattern), never by a blanket self-update policy.
drop policy if exists attendance_self_manage on public.event_attendance;

create policy attendance_self_insert on public.event_attendance
  for insert
  with check (auth.uid() = profile_id);

create policy attendance_self_cancel on public.event_attendance
  for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- BUG 2: profiles_self_update lets a user PATCH ANY column on their own
-- row, including flow_points and reliability_score — a user could set
-- their own points balance directly via the REST API. RLS can't compare
-- old vs new column values, so this needs a trigger. Internal functions
-- that legitimately need to change these fields set a transaction-local
-- flag first; anything else attempting to change them is rejected.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if (new.flow_points is distinct from old.flow_points or new.reliability_score is distinct from old.reliability_score)
     and coalesce(current_setting('flow.internal_write', true), '') <> 'true' then
    raise exception 'flow_points and reliability_score cannot be modified directly.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Existing internal writers need to opt in to the bypass.
create or replace function public.recompute_reliability(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed int;
  v_no_show int;
  v_cancelled int;
  k constant numeric := 3;
begin
  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'no_show'),
    count(*) filter (where status = 'cancelled' and cancelled_by = 'worker')
  into v_completed, v_no_show, v_cancelled
  from public.applications
  where applicant_id = p_profile_id;

  perform set_config('flow.internal_write', 'true', true);
  update public.profiles
  set reliability_score = round(100 * (v_completed + k) / (v_completed + v_no_show + v_cancelled + k))
  where id = p_profile_id;
end;
$$;

-- BUG 3 (same shape as #2): organizations_owner_manage lets an owner
-- PATCH their own org's `verified` flag directly — self-verification.
-- Add org_type for the multi-issuer architecture (item 13) and protect
-- `verified` the same way as profiles' protected fields.
alter table public.organizations
  add column if not exists org_type text not null default 'business'
    check (org_type in ('business', 'nonprofit', 'government', 'school', 'university', 'community', 'flow_official')),
  add column if not exists verification_requested_at timestamptz;

create or replace function public.protect_organization_fields()
returns trigger
language plpgsql
as $$
begin
  if new.verified is distinct from old.verified
     and coalesce(current_setting('flow.internal_write', true), '') <> 'true' then
    raise exception 'verified cannot be set directly — verification is granted by FLOW, not self-assigned.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_organization_fields on public.organizations;
create trigger trg_protect_organization_fields
  before update on public.organizations
  for each row execute function public.protect_organization_fields();

-- Phase 2's gig-completion side effects also write flow_points directly —
-- needs the same internal-write flag now that the guard trigger exists.
create or replace function public.on_application_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.status = new.status then
    return new;
  end if;

  select title into v_title from public.opportunities where id = new.opportunity_id;

  if new.status = 'accepted' then
    perform public.maybe_fill_opportunity(new.opportunity_id);
    perform public.notify(new.applicant_id, 'application_accepted', 'You''re confirmed!',
      'You were accepted for "' || v_title || '".', '/work');
  elsif new.status = 'rejected' then
    perform public.notify(new.applicant_id, 'application_rejected', 'Application update',
      'You were not selected for "' || v_title || '".', '/applications');
  elsif new.status = 'completed' then
    perform set_config('flow.internal_write', 'true', true);
    update public.profiles set flow_points = flow_points + 40 where id = new.applicant_id;
    insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, opportunity_id)
    select new.applicant_id, 'earning', o.pay_cents, 40, o.title, o.id
    from public.opportunities o where o.id = new.opportunity_id and o.pay_cents is not null;
    perform public.recompute_reliability(new.applicant_id);
    perform public.notify(new.applicant_id, 'completion_confirmed', 'Gig completed',
      '"' || v_title || '" was marked complete. It''s now on your FLOW Passport.', '/passport');
  elsif new.status in ('no_show', 'cancelled') then
    perform public.recompute_reliability(new.applicant_id);
  end if;

  return new;
end;
$$;
