create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.flow_points is distinct from old.flow_points or new.reliability_score is distinct from old.reliability_score)
     and coalesce(current_setting('flow.internal_write', true), '') <> 'true' then
    raise exception 'flow_points and reliability_score cannot be modified directly.';
  end if;
  return new;
end;
$$;

create or replace function public.protect_organization_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verified is distinct from old.verified
     and coalesce(current_setting('flow.internal_write', true), '') <> 'true' then
    raise exception 'verified cannot be set directly — verification is granted by FLOW, not self-assigned.';
  end if;
  return new;
end;
$$;
