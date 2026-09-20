-- ============================================================
-- Passport V2 core — part 3: first real-data canonical path + visibility
-- ============================================================
--
-- 1. passport_claim_from_activity(): the first production-usable canonical
--    path, built on EXISTING Flow data. A participant whose host has marked
--    them `completed` on a Flow Activity can put that outcome on their
--    Passport as a canonical claim:
--
--        activity_participants (host-completed row)   <- authoritative source
--          -> evidence   (source_kind 'flow_activity', by reference to the row)
--          -> claim      ('participation.activity', issuer = the host)
--          -> verification decision (platform_verified / system / 'source_record')
--          -> verified claim + audit events
--
--    Everything is derived server-side from the source row — nothing the
--    client sends is trusted except WHICH activity. This is not "AI
--    extraction" and not a self-assertion: the source system (Flow's own
--    activity records, written only by the host through their RPC) is
--    authoritative for the fact, and the verification record says exactly
--    that (`platform_verified`, verifier `system`, reason `source_record`) so
--    provenance never overstates what happened. Idempotent per participant
--    row via (producer, source_ref).
--
-- 2. passport_set_claim_visibility(): the owner's switch between private and
--    public. Visibility is deliberately not frozen with the assertion (it is
--    a disclosure choice, not part of what is asserted), and a sensitive/
--    restricted claim can never be made public.
--
-- Rollback:
--   drop function if exists public.passport_set_claim_visibility(uuid, text);
--   drop function if exists public.passport_claim_from_activity(uuid);

create or replace function public.passport_claim_from_activity(p_activity_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_part public.activity_participants%rowtype;
  v_act public.activities%rowtype;
  v_ref text;
  v_ev_id uuid;
  v_claim_id uuid;
  v_existing uuid;
  v_issuer_kind text;
  v_issuer_type text;
  v_issuer_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_part from public.activity_participants where activity_id = p_activity_id and profile_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  -- Only the host-recorded outcome counts. A participant cannot promote their own
  -- registration/attendance into a claim.
  if v_part.status <> 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  select * into v_act from public.activities where id = p_activity_id;

  v_ref := 'activity_participants:' || v_part.id::text;

  -- Idempotent: a second call returns the existing claim, creating nothing.
  select ce.claim_id into v_existing
    from public.passport_evidence e
    join public.passport_claim_evidence ce on ce.evidence_id = e.id
   where e.producer = 'flow_platform' and e.source_ref = v_ref
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'id', v_existing, 'already_exists', true);
  end if;

  -- The host is the issuer of the outcome: the organization when the activity
  -- is org-hosted, otherwise the hosting person.
  if v_act.organization_id is not null then
    v_issuer_kind := 'entity'; v_issuer_type := 'organization'; v_issuer_id := v_act.organization_id;
  else
    v_issuer_kind := 'entity'; v_issuer_type := 'person'; v_issuer_id := v_act.created_by;
  end if;

  insert into public.passport_evidence
    (subject_type, subject_id, evidence_type, source_kind, source_system, source_ref, producer, artifacts,
     captured_at, provenance, sensitivity, status, created_by)
  values
    ('person', auth.uid(), 'activity_outcome', 'flow_activity', 'flow_platform', v_ref, 'flow_platform', '[]'::jsonb,
     v_part.checked_in_at,
     jsonb_build_object('activity_id', v_act.id, 'activity_type', v_act.activity_type, 'participant_row', v_part.id,
                        'recorded_by', 'host', 'source_table', 'activity_participants'),
     'standard', 'accepted', auth.uid())
  returning id into v_ev_id;

  insert into public.passport_claims
    (subject_type, subject_id, claim_type, value, issuer_kind, issuer_type, issuer_id, source_system, source_ref,
     effective_at, status, visibility, sensitivity, created_by)
  values
    ('person', auth.uid(), 'participation.activity',
     jsonb_build_object('activity_id', v_act.id, 'activity_type', v_act.activity_type, 'title', v_act.title),
     v_issuer_kind, v_issuer_type, v_issuer_id, 'flow_platform', v_ref,
     coalesce(v_part.checked_in_at, now()), 'submitted', 'private', 'standard', auth.uid())
  returning id into v_claim_id;

  insert into public.passport_claim_evidence (claim_id, evidence_id, role, attached_by)
  values (v_claim_id, v_ev_id, 'supports', auth.uid());

  -- The decision on record: verified by the authoritative source itself.
  insert into public.passport_verifications
    (claim_id, method, verifier_type, verifier_id, status, decision, reason_code, requested_by, decided_by, decided_at)
  values
    (v_claim_id, 'platform_verified', 'system', null, 'completed', 'verified', 'source_record', auth.uid(), null, now());

  update public.passport_claims set status = 'verified' where id = v_claim_id;

  perform public._passport_emit_event('evidence.created', 'person', auth.uid()::text, 'person', auth.uid(),
    jsonb_build_object('evidence_id', v_ev_id), jsonb_build_object('evidence_type', 'activity_outcome', 'source_kind', 'flow_activity'));
  perform public._passport_emit_event('claim.created', 'person', auth.uid()::text, 'person', auth.uid(),
    jsonb_build_object('claim_id', v_claim_id), jsonb_build_object('claim_type', 'participation.activity', 'origin', 'source_record'));
  perform public._passport_emit_event('evidence.attached', 'person', auth.uid()::text, 'person', auth.uid(),
    jsonb_build_object('claim_id', v_claim_id, 'evidence_id', v_ev_id), jsonb_build_object('role', 'supports'));
  perform public._passport_emit_event('verification.completed', 'system', 'passport', 'person', auth.uid(),
    jsonb_build_object('claim_id', v_claim_id), jsonb_build_object('method', 'platform_verified', 'decision', 'verified', 'reason_code', 'source_record'));
  perform public._passport_emit_event('claim.verified', 'system', 'passport', 'person', auth.uid(),
    jsonb_build_object('claim_id', v_claim_id), jsonb_build_object('method', 'platform_verified', 'reason_code', 'source_record'));

  return jsonb_build_object('ok', true, 'id', v_claim_id, 'already_exists', false);
end;
$$;

revoke all on function public.passport_claim_from_activity(uuid) from public, anon;
grant execute on function public.passport_claim_from_activity(uuid) to authenticated;

create or replace function public.passport_set_claim_visibility(p_claim_id uuid, p_visibility text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_claim public.passport_claims%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_visibility not in ('private', 'public') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_disclosure');
  end if;
  select * into v_claim from public.passport_claims where id = p_claim_id for update;
  if not found or not public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if p_visibility = 'public' and v_claim.sensitivity <> 'standard' then
    return jsonb_build_object('ok', false, 'reason', 'sensitive_cannot_be_public');
  end if;
  update public.passport_claims set visibility = p_visibility where id = p_claim_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.passport_set_claim_visibility(uuid, text) from public, anon;
grant execute on function public.passport_set_claim_visibility(uuid, text) to authenticated;
