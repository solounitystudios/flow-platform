-- Real bug found during live verification: accept_referral()'s automatic
-- cutoff-based founding-class grant called grant_founding_class(), which
-- itself requires is_flow_admin(true) on the CALLER — but auth.uid() still
-- reflects the original session (a non-admin referral acceptor) even
-- inside a nested SECURITY DEFINER call, since SECURITY DEFINER only
-- changes the effective role for privilege checks, not the session GUCs
-- auth.uid()/auth.jwt() read from. The grant silently failed every time
-- (perform discards the {ok:false} return), so no founding-class member
-- was ever actually created by a referral acceptance.
--
-- Fix: split the actual grant into an internal helper with no admin
-- check (never granted to authenticated/anon — nothing external can call
-- it directly), and have both the admin-facing grant_founding_class() RPC
-- and accept_referral()'s automatic cutoff path call that helper instead.

create or replace function public._award_founding_class(p_profile_id uuid, p_granted_by uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  insert into public.founding_class_grants (profile_id, granted_by, reason)
  values (p_profile_id, p_granted_by, p_reason)
  on conflict (profile_id) do nothing;

  insert into public.profile_credentials (profile_id, credential_type, title, source_table, source_id)
  select p_profile_id, 'founding_member', 'Founding member', 'founding_class_grants', p_profile_id
  where not exists (
    select 1 from public.profile_credentials
    where profile_id = p_profile_id and credential_type = 'founding_member' and revoked_at is null
  );
end;
$$;

-- Deliberately no grant to anon/authenticated/PUBLIC — only callable from
-- another SECURITY DEFINER function's body (grant_founding_class,
-- accept_referral), never directly via PostgREST.
revoke all on function public._award_founding_class(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.grant_founding_class(p_profile_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  if not public.is_flow_admin(true) then
    return jsonb_build_object('ok', false, 'reason', 'not_authorized');
  end if;

  perform public._award_founding_class(p_profile_id, auth.uid(), p_reason);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.grant_founding_class(uuid, text) from public, anon;
grant execute on function public.grant_founding_class(uuid, text) to authenticated;

create or replace function public.accept_referral(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_referral public.referrals%rowtype;
declare v_cutoff timestamptz;
declare v_max int;
declare v_current_count int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;

  select * into v_referral from public.referrals
    where token_hash = p_token_hash and revoked_at is null and expires_at > now()
    for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_or_expired'); end if;

  if v_referral.referrer_id = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  if v_referral.intended_email is not null
    and lower(v_referral.intended_email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  if v_referral.accepted_by is not null then
    if v_referral.accepted_by = auth.uid() then
      return jsonb_build_object('ok', true, 'already_accepted', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  update public.referrals set accepted_by = auth.uid(), accepted_at = now() where id = v_referral.id;

  select (value #>> '{}')::timestamptz into v_cutoff from public.platform_settings where key = 'founding_class_cutoff_at';
  select (value #>> '{}')::int into v_max from public.platform_settings where key = 'founding_class_max_members';
  select count(*) into v_current_count from public.founding_class_grants;

  if v_cutoff is not null and now() < v_cutoff and (v_max is null or v_current_count < v_max) then
    perform public._award_founding_class(auth.uid(), null, 'Referral accepted before founding-class cutoff');
  end if;

  perform public.notify(v_referral.referrer_id, 'connection_accepted', 'Your referral was accepted',
    'Someone you referred just joined FLOW.', '/passport');

  return jsonb_build_object('ok', true, 'already_accepted', false);
end;
$$;

revoke all on function public.accept_referral(text) from public, anon;
grant execute on function public.accept_referral(text) to authenticated;
