-- Employer invitation claim flow. Both functions require an authenticated
-- caller and perform their own authorization checks — neither trusts the
-- application layer. Both are revoked from PUBLIC and anon and granted
-- only to authenticated. Both return the minimum needed to drive the UI:
-- accept_employer_invitation never returns anything about the lead beyond
-- the business_name the invitation is itself for (the invited employer's
-- own business, not another party's private data), and
-- complete_invited_employer_onboarding returns only ok/linked/lead_id.

create or replace function public.accept_employer_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_invite public.employer_invitations%rowtype;
declare v_name text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  select * into v_invite from public.employer_invitations
    where token_hash = p_token_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired'); end if;

  if v_invite.intended_email is not null
    and lower(v_invite.intended_email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  if v_invite.accepted_by is not null and v_invite.accepted_by <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update public.employer_invitations set accepted_by = auth.uid(), accepted_at = coalesce(accepted_at, now()) where id = v_invite.id;
  update public.business_leads set pipeline_stage = 'onboarding_started' where id = v_invite.lead_id;

  select business_name into v_name from public.business_leads where id = v_invite.lead_id;
  return jsonb_build_object('ok', true, 'business_name', v_name);
end;
$$;

revoke all on function public.accept_employer_invitation(text) from public;
grant execute on function public.accept_employer_invitation(text) to authenticated;

create or replace function public.complete_invited_employer_onboarding(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_lead_id uuid;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  if not exists (select 1 from public.organizations where id = p_organization_id and owner_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  select i.lead_id into v_lead_id from public.employer_invitations i
    where i.accepted_by = auth.uid() and i.accepted_at is not null and i.revoked_at is null
    order by i.accepted_at desc limit 1;
  if v_lead_id is null then return jsonb_build_object('ok', true, 'linked', false); end if;

  insert into public.lead_organization_links(lead_id, organization_id, linked_by)
    values (v_lead_id, p_organization_id, auth.uid()) on conflict (lead_id) do nothing;

  update public.business_leads set organization_id = p_organization_id, pipeline_stage = 'onboarding_started' where id = v_lead_id;

  -- Pending only — approval is a deliberate, separate admin decision
  -- (app/admin/(secure)/verification). Accepting an invitation and
  -- creating an organization never marks a company verified or fully
  -- onboarded on its own.
  insert into public.organization_verification_cases(lead_id, organization_id, status, requirements)
    values (v_lead_id, p_organization_id, 'pending', '{"identity":false,"address":false,"domain":false,"licenses":false}'::jsonb)
    on conflict do nothing;

  return jsonb_build_object('ok', true, 'linked', true, 'lead_id', v_lead_id);
end;
$$;

revoke all on function public.complete_invited_employer_onboarding(uuid) from public;
grant execute on function public.complete_invited_employer_onboarding(uuid) to authenticated;
