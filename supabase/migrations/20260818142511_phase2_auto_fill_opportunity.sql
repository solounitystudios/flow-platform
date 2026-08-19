-- When an opportunity's slots become full, flip it to 'filled' automatically —
-- this is what makes "opportunity becomes scheduled/in-progress" in the lifecycle
-- happen without the business needing a separate manual step.
create or replace function public.maybe_fill_opportunity(p_opportunity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filled int;
  v_slots int;
  v_status text;
begin
  select slots, status into v_slots, v_status from public.opportunities where id = p_opportunity_id;
  if v_status <> 'open' then
    return;
  end if;

  select count(*) into v_filled from public.applications
  where opportunity_id = p_opportunity_id and status in ('accepted', 'completed');

  if v_filled >= v_slots then
    update public.opportunities set status = 'filled' where id = p_opportunity_id;
  end if;
end;
$$;

revoke execute on function public.maybe_fill_opportunity(uuid) from public, anon, authenticated;

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
    perform public.maybe_fill_opportunity(new.opportunity_id);
    perform public.notify(v_owner_id, 'application_submitted', 'Opportunity claimed',
      v_applicant_name || ' claimed "' || v_title || '".', '/business/opportunities/' || new.opportunity_id);
  end if;

  return new;
end;
$$;

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
    update public.profiles set flow_points = flow_points + 40 where id = new.applicant_id;
    insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, opportunity_id)
    select new.applicant_id, 'earning', o.pay_cents, 40, o.title, o.id
    from public.opportunities o where o.id = new.opportunity_id and o.pay_cents is not null;
    perform public.recompute_reliability(new.applicant_id);
    perform public.notify(new.applicant_id, 'completion_confirmed', 'Gig completed',
      '"' || v_title || '" was marked complete. It''s now on your FLOW Passport.', '/passport');
  elsif new.status in ('no_show', 'cancelled') then
    perform public.recompute_reliability(new.applicant_id);
    -- a cancellation/no-show frees the slot back up for reopening
    update public.opportunities set status = 'open' where id = new.opportunity_id and status = 'filled';
  end if;

  return new;
end;
$$;
