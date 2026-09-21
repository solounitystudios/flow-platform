-- ============================================================
-- Passport V2 — part 7: "Why does Passport show this?"
-- ============================================================
--
-- passport_claim_explanation() returns the provenance chain for one claim:
--
--   SUBJECT -> CLAIM -> EVIDENCE -> SOURCE -> ISSUER -> VERIFICATION METHOD
--           -> VERIFIER -> DECISION -> TIMESTAMP
--
-- disclosed according to WHO IS ASKING:
--
--   owner / admin (AAL2) / an asked reviewer   the full chain, including evidence
--                                              METADATA (type, source kind, time,
--                                              sensitivity, artifact count) and the
--                                              decision's reason code
--   public viewer (a public, verified claim    what the public claim itself warrants:
--   of a public passport)                      how it was verified, by whom, when,
--                                              until when, and how MANY pieces of
--                                              evidence — never their kinds, notes,
--                                              provenance or anything else
--
-- Nobody is ever shown a source document: artifact references, evidence
-- provenance, free-text notes and verifier identities the viewer has no
-- business seeing are not part of any branch of this response. Anyone who
-- couldn't already read the claim gets "not found" (no existence oracle).
--
-- Rollback:
--   drop function if exists public.passport_claim_explanation(uuid);

create or replace function public.passport_claim_explanation(p_claim_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_claim public.passport_claims%rowtype;
  v_viewer text;
  v_full boolean;
  v_ver public.passport_verifications%rowtype;
  v_verifier jsonb := null;
  v_verification jsonb := null;
  v_issuer jsonb;
  v_evidence jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_effective text;
  v_name text;
begin
  select * into v_claim from public.passport_claims where id = p_claim_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Who is asking? Strongest relationship wins; no relationship = not found.
  if public.passport_subject_owner_ok(v_claim.subject_type, v_claim.subject_id) then
    v_viewer := 'owner';
  elsif public.is_flow_admin(true) then
    v_viewer := 'admin';
  elsif public.passport_is_claim_reviewer(v_claim.id) then
    v_viewer := 'reviewer';
  -- Public eligibility is delegated to the canonical M1 projection so the explanation
  -- can never disclose a claim that passport_public_claims() would hide.
  elsif exists (select 1 from public.passport_public_claims(null, v_claim.id, 1)) then
    v_viewer := 'public';
  else
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_full := v_viewer in ('owner', 'admin', 'reviewer');

  v_effective := case
    when v_claim.status in ('verified', 'stale', 'disconnected') and v_claim.expires_at is not null and v_claim.expires_at <= now() then 'expired'
    else v_claim.status
  end;

  -- ISSUER: who stands behind the assertion. Organization names are public
  -- information; a person issuer is named only to viewers with a relationship.
  v_issuer := case v_claim.issuer_kind
    when 'subject' then jsonb_build_object('kind', 'subject', 'label', null)
    when 'external' then jsonb_build_object('kind', 'external', 'label', v_claim.issuer_label)
    else jsonb_build_object(
      'kind', 'entity',
      'entity_type', v_claim.issuer_type,
      'label', case v_claim.issuer_type
        when 'organization' then (select o.name from public.organizations o where o.id = v_claim.issuer_id)
        when 'person' then case when v_full then (select coalesce(p.full_name, p.username) from public.profiles p where p.id = v_claim.issuer_id) else null end
        else null end)
  end;

  -- VERIFICATION: the latest completed decision that verified this claim.
  select * into v_ver from public.passport_verifications
   where claim_id = v_claim.id and status = 'completed' and decision = 'verified'
   order by decided_at desc limit 1;
  if found then
    v_verifier := case v_ver.verifier_type
      when 'system' then jsonb_build_object('kind', 'system', 'label', 'Flow')
      when 'organization' then jsonb_build_object('kind', 'organization', 'label', (select o.name from public.organizations o where o.id = v_ver.verifier_id))
      when 'person' then jsonb_build_object('kind', 'person',
        'label', case when v_viewer in ('owner', 'admin') then (select coalesce(p.full_name, p.username) from public.profiles p where p.id = v_ver.verifier_id) else null end)
      else jsonb_build_object('kind', v_ver.verifier_type, 'label', null)
    end;
    v_verification := jsonb_build_object(
      'method', v_ver.method,
      'verifier', v_verifier,
      'decided_at', v_ver.decided_at,
      'expires_at', v_ver.expires_at,
      -- the reason code is for the people involved, not the public
      'reason_code', case when v_full then v_ver.reason_code else null end);
  end if;

  -- EVIDENCE: metadata only, and only for people with a relationship. Never a
  -- reference to the artifact, never provenance detail.
  if v_full then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id, 'evidence_type', e.evidence_type, 'source_kind', e.source_kind, 'captured_at', e.captured_at,
             'sensitivity', e.sensitivity, 'status', e.status, 'artifact_count', jsonb_array_length(e.artifacts), 'role', ce.role)
           order by ce.attached_at), '[]'::jsonb)
      into v_evidence
      from public.passport_claim_evidence ce
      join public.passport_evidence e on e.id = ce.evidence_id
     where ce.claim_id = v_claim.id and ce.detached_at is null;

    select coalesce(jsonb_agg(jsonb_build_object('method', v.method, 'status', v.status, 'requested_at', v.requested_at) order by v.requested_at), '[]'::jsonb)
      into v_pending from public.passport_verifications v where v.claim_id = v_claim.id and v.status = 'requested';
  else
    select jsonb_build_object('count', count(*))
      into v_evidence
      from public.passport_claim_evidence ce where ce.claim_id = v_claim.id and ce.detached_at is null;
  end if;

  -- HISTORY: what happened to it, when — event types and times only, owner/admin.
  if v_viewer in ('owner', 'admin') then
    select coalesce(jsonb_agg(jsonb_build_object('type', ev.event_type, 'at', ev.occurred_at) order by ev.seq), '[]'::jsonb)
      into v_history from public.passport_events ev where ev.refs ->> 'claim_id' = v_claim.id::text;
  end if;

  return jsonb_build_object(
    'ok', true,
    'viewer', v_viewer,
    'claim', jsonb_build_object(
      'id', v_claim.id,
      'claim_type', v_claim.claim_type,
      'subject', jsonb_build_object('type', v_claim.subject_type, 'id', v_claim.subject_id),
      'status', v_claim.status,
      'effective_status', v_effective,
      'effective_at', v_claim.effective_at,
      'expires_at', v_claim.expires_at,
      'visibility', v_claim.visibility,
      'created_at', v_claim.created_at,
      'sensitivity', case when v_full then v_claim.sensitivity else null end,
      'status_reason_code', case when v_full then v_claim.status_reason_code else null end),
    'source', jsonb_build_object('system', v_claim.source_system, 'ref', case when v_viewer in ('owner', 'admin') then v_claim.source_ref else null end),
    'issuer', v_issuer,
    'verification', v_verification,
    'evidence', v_evidence,
    'pending_verifications', v_pending,
    'history', v_history);
end;
$$;

revoke all on function public.passport_claim_explanation(uuid) from public;
-- anon may call it: a public passport page shows "why" for public, verified claims. For anon every
-- relationship check is false except the public branch, which is exactly what they may see.
grant execute on function public.passport_claim_explanation(uuid) to anon, authenticated, service_role;
