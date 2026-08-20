-- conversation_members_read subqueried its own table from within its own
-- policy (`from public.conversation_members m` inside a policy defined ON
-- conversation_members). Postgres detects this as infinite recursion
-- (42P17) on any select, including the exact shape the app uses
-- (select ... from conversation_members where profile_id = auth.uid()).
-- conversations_member_read and messages_member_read both subquery into
-- conversation_members too, so they inherit the same failure. Same fix
-- pattern as is_blocked_between(): a SECURITY DEFINER helper breaks the
-- recursive policy evaluation chain.
create or replace function public.is_conversation_member(p_conversation_id uuid, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation_id and m.profile_id = p_profile_id
  );
$$;

-- No anon use case for messages at all (every messages route is already
-- gated behind auth at the app layer) — unlike is_blocked_between, only
-- authenticated needs execute here.
revoke execute on function public.is_conversation_member(uuid, uuid) from public;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

drop policy conversations_member_read on public.conversations;
create policy conversations_member_read
  on public.conversations for select
  using (public.is_conversation_member(id, auth.uid()));

drop policy conversation_members_read on public.conversation_members;
create policy conversation_members_read
  on public.conversation_members for select
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy messages_member_read on public.messages;
create policy messages_member_read
  on public.messages for select
  using (public.is_conversation_member(conversation_id, auth.uid()));
