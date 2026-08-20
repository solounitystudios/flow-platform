-- This project's public schema has a default privilege that auto-grants
-- EXECUTE on newly created functions directly to anon (not merely via
-- PUBLIC) — the same class of gap found and fixed in the Connections/
-- Messages hardening pass (see revoke_public_exec_rpcs). The four Batch 2
-- RPCs each already self-authorize via is_flow_admin(true) inline, so
-- this was never an actual privilege-escalation path, but the task's
-- requirement to revoke EXECUTE from PUBLIC and anon still applies as
-- defense in depth. Verified after this migration with
-- has_function_privilege('anon', ..., 'EXECUTE') -> false on all four.

revoke execute on function public.change_lead_stage(uuid, text, text) from public, anon;
revoke execute on function public.import_business_leads(jsonb) from public, anon;
revoke execute on function public.decide_verification_case(uuid, text, text, text, uuid) from public, anon;
revoke execute on function public.generate_onboarding_followup_tasks() from public, anon;
