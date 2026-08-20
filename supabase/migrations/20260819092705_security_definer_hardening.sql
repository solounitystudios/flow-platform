-- Security advisor review of SECURITY DEFINER exposure.
--
-- is_blocked_between(a, b): flagged as anon+authenticated callable. This
-- is INTENTIONAL and must stay — profiles_block_restrict (a RESTRICTIVE
-- policy on public.profiles) calls it directly for every profile read,
-- including anonymous public-profile browsing, and a prior migration
-- (restore_is_blocked_between_exec) already documents that revoking this
-- grant breaks profile/Passport lookups entirely. No change here.
--
-- is_conversation_member(conversation_id, profile_id): flagged the same
-- way, but unlike is_blocked_between it is only ever referenced by RLS
-- policies on conversations/conversation_members/messages — tables that
-- have no legitimate anonymous access path (there is no public messaging
-- feature; every real caller is authenticated). The `authenticated` grant
-- is required (conversations_member_read, conversation_members_read,
-- messages_member_read all call it) and stays. The `anon` grant has no
-- legitimate caller — revoke it as defense in depth. An anonymous REST
-- call against these tables will now get a permission error instead of
-- being silently evaluated (and filtered to zero rows) by RLS.
revoke execute on function public.is_conversation_member(uuid, uuid) from anon;

-- evaluate_achievements(profile_id): a legitimate client-facing RPC
-- (called after gig completion, event check-in, etc.) but unlike its
-- sibling generate_match_recommendations(profile_id), it had no
-- authorization check at all — any authenticated user could force-run
-- achievement evaluation for ANY other profile_id. It can't fabricate
-- false achievement conditions (every unlock check reads real completed
-- work), so the practical impact is limited to prematurely awarding a
-- points bonus, but it's still not least-privilege. Add the same
-- self-or-admin check generate_match_recommendations already uses.
create or replace function public.evaluate_achievements(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_gigs_completed int;
  v_volunteer_completed int;
  v_events_attended int;
  v_networking_attended int;
  v_profile record;
  v_skills_count int;
  v_evidence_count int;
  v_verified_credentials int;
  v_recommendations_count int;
  v_intents_count int;
  v_achievement record;
  v_earned boolean;
begin
  if auth.uid() is null then
    return;
  end if;
  if auth.uid() <> p_profile_id and not public.is_flow_admin(false) then
    return;
  end if;

  select count(*) into v_gigs_completed from public.applications where applicant_id = p_profile_id and status = 'completed';
  select count(*) into v_volunteer_completed from public.applications a
    join public.opportunities o on o.id = a.opportunity_id
    where a.applicant_id = p_profile_id and a.status = 'completed' and o.opportunity_type = 'volunteer';
  select count(*) into v_events_attended from public.event_attendance where profile_id = p_profile_id and status = 'attended';
  select count(*) into v_networking_attended from public.event_attendance ea
    join public.events e on e.id = ea.event_id
    where ea.profile_id = p_profile_id and ea.status = 'attended' and e.category = 'Networking';

  select * into v_profile from public.profiles where id = p_profile_id;
  select count(*) into v_skills_count from public.profile_skills where profile_id = p_profile_id;
  select count(*) into v_evidence_count from public.verifications where profile_id = p_profile_id;
  select count(*) into v_verified_credentials from public.verifications where profile_id = p_profile_id and status = 'verified';
  select count(*) into v_recommendations_count from public.recommendations where recipient_id = p_profile_id;
  select count(*) into v_intents_count from public.member_intents where profile_id = p_profile_id;

  for v_achievement in select * from public.achievements loop
    if exists (select 1 from public.profile_achievements where profile_id = p_profile_id and achievement_key = v_achievement.key) then
      continue;
    end if;

    v_earned := case v_achievement.key
      when 'first_flow' then (v_gigs_completed + v_events_attended) >= 1
      when 'reliable_10' then v_gigs_completed >= 10
      when 'community_builder' then v_volunteer_completed >= 3
      when 'networked' then v_networking_attended >= 5
      when 'flow_regular' then v_events_attended >= 10
      when 'core_profile_complete' then v_profile.full_name is not null and v_profile.bio is not null and length(coalesce(v_profile.bio, '')) > 0
      when 'first_skill_added' then v_skills_count >= 1
      when 'first_evidence_submitted' then v_evidence_count >= 1
      when 'first_credential_verified' then v_verified_credentials >= 1
      when 'first_recommendation_received' then v_recommendations_count >= 1
      when 'first_intent_set' then v_intents_count >= 1
      when 'mentor_eligible' then v_profile.reliability_score >= 90 and v_verified_credentials >= 1
      else false
    end;

    if v_earned then
      insert into public.profile_achievements (profile_id, achievement_key) values (p_profile_id, v_achievement.key);

      if v_achievement.points_bonus > 0 then
        perform set_config('flow.internal_write', 'true', true);
        update public.profiles set flow_points = flow_points + v_achievement.points_bonus where id = p_profile_id;
        insert into public.flow_ledger (profile_id, entry_type, amount_cents, points, description, source)
        values (p_profile_id, 'reward', 0, v_achievement.points_bonus, 'Achievement: ' || v_achievement.title, 'achievement');
      end if;

      perform public.notify(p_profile_id, 'achievement_unlocked', 'Achievement unlocked: ' || v_achievement.title,
        v_achievement.description, '/passport');
    end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_achievements(uuid) from public, anon;
grant execute on function public.evaluate_achievements(uuid) to authenticated;
