-- ============================================================
-- PHASE 2: opportunity lifecycle, notifications, reliability
-- ============================================================

-- 1. Opportunity discovery columns (geo, remote, instant-book, category)
alter table public.opportunities
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists is_remote boolean not null default false,
  add column if not exists instant_book boolean not null default false,
  add column if not exists category text;

-- 2. Application lifecycle columns
alter table public.applications
  add column if not exists responded_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists worker_ack_at timestamptz,
  add column if not exists cancelled_by text check (cancelled_by in ('worker', 'business'));

-- Rebuild the status domain to match the v2 lifecycle (0 rows exist yet, safe to redefine)
alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'completed', 'no_show', 'cancelled'));
alter table public.applications alter column status set default 'pending';

-- One application per person per opportunity
alter table public.applications
  add constraint applications_unique_applicant unique (opportunity_id, applicant_id);

-- Business (opportunity owner) can update applications on their own opportunities
-- (applications_self_update already covers the applicant themselves)
drop policy if exists applications_owner_update on public.applications;
create policy applications_owner_update on public.applications
  for update
  using (exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.created_by = auth.uid()))
  with check (exists (select 1 from public.opportunities o where o.id = applications.opportunity_id and o.created_by = auth.uid()));

-- 3. Notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'application_submitted', 'application_accepted', 'application_rejected',
    'opportunity_changed', 'opportunity_cancelled', 'gig_reminder',
    'completion_confirmed', 'recommendation_received'
  )),
  title text not null,
  body text,
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select using (auth.uid() = profile_id);

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- No insert policy for regular roles: notifications are only ever created by the
-- SECURITY DEFINER trigger functions below, which bypass RLS. This is deliberate —
-- it stops a user from spoofing notifications to themselves or anyone else.

-- 4. Recommendations: rating/skills + hire-verified insert
alter table public.recommendations
  add column if not exists rating smallint check (rating between 1 and 5),
  add column if not exists skills_demonstrated text[];

drop policy if exists recommendations_author_insert on public.recommendations;
create policy recommendations_author_insert on public.recommendations
  for insert
  with check (
    auth.uid() = author_id
    and opportunity_id is not null
    and exists (
      select 1 from public.applications a
      join public.opportunities o on o.id = a.opportunity_id
      where a.opportunity_id = recommendations.opportunity_id
        and a.applicant_id = recommendations.recipient_id
        and a.status = 'completed'
        and o.created_by = auth.uid()
    )
  );

-- 5. Transparent reliability system
-- Score = 100 * (completed + K) / (completed + no_shows + worker_cancellations + K).
-- K=3 is grace smoothing: a first no-show doesn't crater a new member's score, and
-- someone with zero history starts at a clean 100. The formula and its inputs are
-- fully exposed via reliability_breakdown below — nothing about it is opaque.
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

  update public.profiles
  set reliability_score = round(100 * (v_completed + k) / (v_completed + v_no_show + v_cancelled + k))
  where id = p_profile_id;
end;
$$;

create or replace view public.reliability_breakdown as
select
  p.id as profile_id,
  count(a.*) filter (where a.status = 'accepted') as currently_accepted,
  count(a.*) filter (where a.status = 'completed') as gigs_completed,
  count(a.*) filter (where a.status = 'no_show') as no_shows,
  count(a.*) filter (where a.status = 'cancelled' and a.cancelled_by = 'worker') as worker_cancellations,
  count(a.*) filter (where a.status = 'withdrawn') as withdrawn_before_start,
  p.reliability_score as reliability_score
from public.profiles p
left join public.applications a on a.applicant_id = p.id
group by p.id, p.reliability_score;

-- 6. Notification helper
create or replace function public.notify(
  p_profile_id uuid, p_type text, p_title text, p_body text, p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (profile_id, type, title, body, href)
  values (p_profile_id, p_type, p_title, p_body, p_href);
end;
$$;

-- 7. Application state machine (INSERT + UPDATE) — the real enforcement layer.
-- RLS says "you may touch this row"; this says "but only in these legal ways."
create or replace function public.enforce_application_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
  v_opportunity record;
  v_filled_slots int;
begin
  select o.* into v_opportunity from public.opportunities o where o.id = new.opportunity_id;
  if v_opportunity is null then
    raise exception 'Opportunity not found.';
  end if;

  select exists(select 1 where v_opportunity.created_by = auth.uid()) into v_is_owner;

  if tg_op = 'INSERT' then
    if auth.uid() <> new.applicant_id then
      raise exception 'You can only apply as yourself.';
    end if;
    if v_opportunity.status <> 'open' then
      raise exception 'This opportunity is no longer open.';
    end if;

    select count(*) into v_filled_slots
    from public.applications
    where opportunity_id = new.opportunity_id and status in ('accepted', 'completed');

    if new.status = 'accepted' then
      if not v_opportunity.instant_book then
        raise exception 'This opportunity requires an application, not an instant claim.';
      end if;
      if v_filled_slots >= v_opportunity.slots then
        raise exception 'This opportunity is already full.';
      end if;
      new.accepted_at := now();
      new.responded_at := now();
    elsif new.status is null or new.status = 'pending' then
      new.status := 'pending';
    else
      raise exception 'New applications must start pending (or accepted, for instant-book opportunities).';
    end if;

    return new;
  end if;

  -- tg_op = 'UPDATE' from here on

  -- Worker acknowledging a completed gig: only worker_ack_at may change.
  if old.status = 'completed' and new.status = 'completed' then
    if auth.uid() = old.applicant_id and old.worker_ack_at is null and new.worker_ack_at is not null then
      return new;
    end if;
    raise exception 'This application is already completed and cannot be modified further.';
  end if;

  if old.status = new.status then
    return new;
  end if;

  if old.status = 'pending' and new.status = 'accepted' then
    if not v_is_owner then
      raise exception 'Only the opportunity owner can accept an applicant.';
    end if;
    select count(*) into v_filled_slots
    from public.applications
    where opportunity_id = old.opportunity_id and status in ('accepted', 'completed');
    if v_filled_slots >= v_opportunity.slots then
      raise exception 'This opportunity is already full.';
    end if;
    new.accepted_at := now();
    new.responded_at := now();
    return new;
  end if;

  if old.status = 'pending' and new.status = 'rejected' then
    if not v_is_owner then
      raise exception 'Only the opportunity owner can reject an applicant.';
    end if;
    new.responded_at := now();
    return new;
  end if;

  if old.status = 'pending' and new.status = 'withdrawn' then
    if auth.uid() <> old.applicant_id then
      raise exception 'Only the applicant can withdraw an application.';
    end if;
    return new;
  end if;

  if old.status = 'accepted' and new.status = 'completed' then
    if not v_is_owner then
      raise exception 'Only the opportunity owner can mark work completed.';
    end if;
    new.resolved_at := now();
    return new;
  end if;

  if old.status = 'accepted' and new.status = 'no_show' then
    if not v_is_owner then
      raise exception 'Only the opportunity owner can report a no-show.';
    end if;
    new.resolved_at := now();
    return new;
  end if;

  if old.status = 'accepted' and new.status = 'cancelled' then
    if auth.uid() = old.applicant_id then
      new.cancelled_by := 'worker';
    elsif v_is_owner then
      new.cancelled_by := 'business';
    else
      raise exception 'Not authorized to cancel this application.';
    end if;
    new.resolved_at := now();
    return new;
  end if;

  raise exception 'Cannot move an application from % to %.', old.status, new.status;
end;
$$;

drop trigger if exists trg_enforce_application_lifecycle on public.applications;
create trigger trg_enforce_application_lifecycle
  before insert or update on public.applications
  for each row execute function public.enforce_application_lifecycle();

-- 8. Side effects after a lifecycle change lands: notifications, ledger, reliability.
create or replace function public.on_application_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
  v_applicant_name text;
begin
  select created_by, title into v_owner_id, v_title from public.opportunities where id = new.opportunity_id;
  select coalesce(full_name, 'A FLOW member') into v_applicant_name from public.profiles where id = new.applicant_id;

  if new.status = 'pending' then
    perform public.notify(v_owner_id, 'application_submitted', 'New applicant',
      v_applicant_name || ' applied to "' || v_title || '".', '/business/opportunities/' || new.opportunity_id);
  elsif new.status = 'accepted' then
    perform public.recompute_reliability(new.applicant_id);
    perform public.notify(v_owner_id, 'application_submitted', 'Opportunity claimed',
      v_applicant_name || ' claimed "' || v_title || '".', '/business/opportunities/' || new.opportunity_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_on_application_inserted on public.applications;
create trigger trg_on_application_inserted
  after insert on public.applications
  for each row execute function public.on_application_inserted();

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
    perform public.notify(new.applicant_id, 'application_accepted', 'You''re confirmed!',
      'You were accepted for "' || v_title || '".', '/work');
  elsif new.status = 'rejected' then
    perform public.notify(new.applicant_id, 'application_rejected', 'Application update',
      'You were not selected for "' || v_title || '".', '/applications');
  elsif new.status = 'completed' then
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

drop trigger if exists trg_on_application_updated on public.applications;
create trigger trg_on_application_updated
  after update on public.applications
  for each row execute function public.on_application_updated();

-- 9. Opportunity cancellation notifies active applicants
create or replace function public.on_opportunity_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    for v_app in
      select applicant_id from public.applications
      where opportunity_id = new.id and status in ('pending', 'accepted')
    loop
      perform public.notify(v_app.applicant_id, 'opportunity_cancelled', 'Opportunity cancelled',
        '"' || new.title || '" was cancelled by the business.', '/applications');
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_opportunity_cancelled on public.opportunities;
create trigger trg_on_opportunity_cancelled
  after update on public.opportunities
  for each row execute function public.on_opportunity_cancelled();

-- 10. Recommendation received notification
create or replace function public.on_recommendation_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_name text;
begin
  select coalesce(full_name, 'Someone') into v_author_name from public.profiles where id = new.author_id;
  perform public.notify(new.recipient_id, 'recommendation_received', 'New recommendation',
    v_author_name || ' left you a recommendation.', '/passport');
  return new;
end;
$$;

drop trigger if exists trg_on_recommendation_created on public.recommendations;
create trigger trg_on_recommendation_created
  after insert on public.recommendations
  for each row execute function public.on_recommendation_created();
