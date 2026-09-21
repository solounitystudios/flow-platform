-- ============================================================
-- Passport V2 — independent security review: fixes (additive; no RLS policy touched)
-- ============================================================
--
-- Each item below was REPRODUCED against a fresh replay before being fixed; see
-- tests/db/repros/passport_v2_review_attacks.repro.sql (R01, R05, R06c) and the
-- regression suite tests/db/passport_v2_review_regression.test.sql that now pins them.
--
--   R05  HIGH    consent revoked (or expired) after a capture request was opened under it was
--                still honoured: the gateway kept serving the request and ingesting evidence.
--                Consent is now evaluated where it is used: revoking cascades to open requests,
--                and the gateway re-evaluates the request (window AND consent) on every touch.
--   R01  MEDIUM  passport_capture_related_ok(subject, type, id) was executable by any signed-in
--                user for an ARBITRARY subject: a participation/application oracle
--                ("did person P apply to / attend / join X?"). Now service_role only; the
--                SECURITY DEFINER create RPC that needs it is unaffected.
--   R06c LOW     passport_gateway_report_capture_status accepted statuses the contract forbids
--                (completed / cancelled / expired), so a producer could close a request with no
--                evidence. The database now enforces accepted | started | failed.
--   perf         explanation history scanned the whole event ledger by refs->>'claim_id'.
--
-- Deliberately NOT changed: the passport_expire_due_* sweeps stay callable by signed-in users (R03, LOW).
-- They only advance rows already past their expiry, existing suites rely on calling them as a user, and
-- no exploit was shown. Revisit when a scheduler exists and they can be service_role-only.
--
-- NOT fixed here (need an explicit policy / schema decision; documented in the review report):
--   raw passport_claims rows are readable by anon (source_ref, issuer_id, created_by, full value);
--   verification by an organization the subject controls; capture requests are not bound to a
--   producer; user-mintable platform claim types.
--
-- Rollback:
--   grant execute on function public.passport_capture_related_ok(uuid, text, uuid) to authenticated;
--   drop index if exists public.passport_events_claim_ref_idx;
--   (the four replaced functions: re-run their definitions from migrations 120300 / 120500)

-- R05: consent-live aware request expiry
create or replace function public._passport_expire_capture(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v public.passport_capture_requests%rowtype;
begin
  -- An open request stops being answerable when EITHER its own window closed OR
  -- the consent it was created under is no longer live (revoked / expired / gone).
  update public.passport_capture_requests r
     set status = case when r.expires_at <= now() then 'expired' else 'cancelled' end
   where r.id = p_id and r.status in ('requested', 'accepted', 'started')
     and (r.expires_at <= now()
          or (r.consent_basis = 'consent_grant' and not exists (
                select 1 from public.passport_consent_grants g
                 where g.id = r.consent_grant_id and g.status = 'active' and g.expires_at > now())))
  returning * into v;
  if not found then return false; end if;
  if v.status = 'expired' then
    perform public._passport_emit_event('capture.expired', 'system', 'passport', v.subject_type, v.subject_id,
      jsonb_build_object('capture_request_id', v.id), jsonb_build_object('purpose', v.purpose));
  else
    perform public._passport_emit_event('capture.cancelled', 'system', 'passport', v.subject_type, v.subject_id,
      jsonb_build_object('capture_request_id', v.id), jsonb_build_object('purpose', v.purpose, 'cause', 'consent_no_longer_active'));
  end if;
  return true;
end;
$$;

-- R05: revoking consent stops the requests opened under it
create or replace function public.passport_revoke_consent(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare v_grant public.passport_consent_grants%rowtype; v_req uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if p_reason is not null and char_length(p_reason) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'reason_too_long');
  end if;
  select * into v_grant from public.passport_consent_grants where id = p_id for update;
  if not found or v_grant.grantor_type <> 'person' or v_grant.grantor_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_grant.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  update public.passport_consent_grants set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason where id = p_id;
  perform public._passport_emit_event('consent.revoked', 'person', auth.uid()::text, 'person', v_grant.grantor_id,
    jsonb_build_object('consent_id', p_id), jsonb_build_object('purpose', v_grant.purpose));
  -- Consent is evaluated where it is USED: requests opened under this grant stop being answerable now.
  for v_req in select id from public.passport_capture_requests where consent_grant_id = p_id and status in ('requested', 'accepted', 'started') loop
    perform public._passport_expire_capture(v_req);
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;

-- R05 + R06c: the gateway re-evaluates the request before trusting it
create or replace function public.passport_gateway_report_capture_status(p_client text, p_report jsonb, p_payload_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v public.passport_capture_requests%rowtype;
  v_rcpt public.passport_gateway_receipts%rowtype;
  v_key text := p_report ->> 'idempotency_key';
  v_status text := p_report ->> 'status';
  v_session text := p_report ->> 'capture_session_id';
  v_reason text := p_report ->> 'reason_code';
  v_result jsonb;
begin
  -- Idempotency first: a retry of an already-processed report changes nothing.
  select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'status_report' and idempotency_key = v_key;
  if found then
    if v_rcpt.payload_sha256 <> p_payload_sha256 then
      return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
    end if;
    return v_rcpt.result || jsonb_build_object('duplicate', true);
  end if;

  -- The contract lets a producer report only these; the database enforces it too.
  if v_status is null or v_status not in ('accepted', 'started', 'failed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
  end if;
  -- Re-evaluate the request (window AND the consent it rests on) before trusting its state.
  perform public._passport_expire_capture((p_report ->> 'request_id')::uuid);
  select * into v from public.passport_capture_requests where id = (p_report ->> 'request_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_capture_request');
  end if;
  if v.status in ('requested', 'accepted', 'started') and v.expires_at <= now() then
    perform public._passport_expire_capture(v.id);
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status = 'expired' then
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status not in ('requested', 'accepted', 'started') then
    return jsonb_build_object('ok', false, 'reason', 'request_not_open');
  end if;
  if v.status <> v_status then
    if not public.passport_capture_transition_allowed(v.status, v_status) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    if v.capture_session_id is not null and v_session is not null and v_session <> v.capture_session_id then
      return jsonb_build_object('ok', false, 'reason', 'invalid_transition');
    end if;
    update public.passport_capture_requests
       set status = v_status,
           capture_session_id = coalesce(capture_session_id, v_session),
           failure_reason = case when v_status = 'failed' then v_reason else failure_reason end
     where id = v.id;
    perform public._passport_emit_event('capture.' || v_status, 'service', p_client, v.subject_type, v.subject_id,
      jsonb_build_object('capture_request_id', v.id),
      jsonb_build_object('reason_code', v_reason), v.correlation_id, p_client);
  end if;

  v_result := jsonb_build_object('ok', true, 'request_id', v.id, 'status', v_status);
  insert into public.passport_gateway_receipts (client_id, kind, idempotency_key, object_key, payload_sha256, result)
  values (p_client, 'status_report', v_key, v.id::text, p_payload_sha256, v_result);
  return v_result || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.passport_gateway_ingest_evidence_package(p_client text, p_package jsonb, p_payload_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v public.passport_capture_requests%rowtype;
  v_rcpt public.passport_gateway_receipts%rowtype;
  v_ev public.passport_evidence%rowtype;
  v_key text := p_package ->> 'idempotency_key';
  v_pkg_id text := p_package ->> 'package_id';
  v_subject_type text := public.passport_canonical_subject_type(p_package -> 'subject' ->> 'type');
  v_subject_id uuid := (p_package -> 'subject' ->> 'id')::uuid;
  v_artifacts jsonb := p_package -> 'artifacts';
  v_meta jsonb := coalesce(p_package -> 'source_metadata', '{}'::jsonb);
  v_required text;
  v_provenance jsonb;
  v_sensitivity text;
  v_result jsonb;
  v_ev_id uuid;
begin
  -- 1. Idempotency: same key + same body = safe retry; same key + different body = conflict.
  select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'evidence_package' and idempotency_key = v_key;
  if found then
    if v_rcpt.payload_sha256 <> p_payload_sha256 then
      return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
    end if;
    return v_rcpt.result || jsonb_build_object('duplicate', true);
  end if;
  -- The same package re-sent under a NEW idempotency key must not create a second record either.
  select * into v_ev from public.passport_evidence where producer = p_client and source_ref = v_pkg_id;
  if found then
    select * into v_rcpt from public.passport_gateway_receipts where client_id = p_client and kind = 'evidence_package' and object_key = v_pkg_id limit 1;
    if found and v_rcpt.payload_sha256 = p_payload_sha256 then
      return v_rcpt.result || jsonb_build_object('duplicate', true);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'idempotency_conflict');
  end if;

  -- 2. The request it answers must exist, be open, and be unexpired.
  -- Re-evaluate the request (window AND the consent it rests on) before trusting its state.
  perform public._passport_expire_capture((p_package ->> 'capture_request_id')::uuid);
  select * into v from public.passport_capture_requests where id = (p_package ->> 'capture_request_id')::uuid for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_capture_request');
  end if;
  if v.status in ('requested', 'accepted', 'started') and v.expires_at <= now() then
    perform public._passport_expire_capture(v.id);
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status = 'expired' then
    return jsonb_build_object('ok', false, 'reason', 'request_expired');
  end if;
  if v.status not in ('requested', 'accepted', 'started') then
    return jsonb_build_object('ok', false, 'reason', 'request_not_open');
  end if;

  -- 3. Evidence about one subject can never answer a request about another.
  if v.subject_type <> v_subject_type or v.subject_id <> v_subject_id then
    return jsonb_build_object('ok', false, 'reason', 'subject_mismatch');
  end if;

  -- 4. Honour the request's data policies.
  if p_package ? 'location' and v.location_policy <> 'optional' then
    return jsonb_build_object('ok', false, 'reason', 'location_not_permitted');
  end if;
  if p_package ? 'operator' and v.operator_identity_policy <> 'optional' then
    return jsonb_build_object('ok', false, 'reason', 'operator_not_permitted');
  end if;
  foreach v_required in array v.required_metadata loop
    if not (v_meta ? v_required) then
      return jsonb_build_object('ok', false, 'reason', 'metadata_missing');
    end if;
  end loop;

  -- 5. Artifacts are Capture-hosted references of the requested kind — never inline data.
  if not public.passport_artifacts_valid(v_artifacts)
     or exists (select 1 from jsonb_array_elements(v_artifacts) a(item)
                where a.item -> 'storage' ->> 'provider' <> 'flow_capture' or a.item ->> 'kind' not in (v.evidence_type, 'other')) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_schema');
  end if;

  v_sensitivity := case when v.purpose = 'credential_document' or p_package ? 'location' then 'sensitive' else 'standard' end;
  v_provenance := jsonb_build_object(
      'capture_session_id', p_package ->> 'capture_session_id',
      'capture_request_id', v.id,
      'producer_version', p_package -> 'provenance' ->> 'producer_version',
      'source_metadata', v_meta)
    || case when p_package -> 'provenance' ? 'capture_method' then jsonb_build_object('capture_method', p_package -> 'provenance' ->> 'capture_method') else '{}'::jsonb end
    || case when p_package -> 'provenance' ? 'device' then jsonb_build_object('device', p_package -> 'provenance' ->> 'device') else '{}'::jsonb end
    || case when p_package ? 'operator' then jsonb_build_object('operator', p_package -> 'operator') else '{}'::jsonb end
    || case when p_package ? 'location' then jsonb_build_object('location', p_package -> 'location') else '{}'::jsonb end;
  if pg_column_size(v_provenance) > 8192 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_schema');
  end if;

  -- 6. Record UNVERIFIED evidence. No claim is created, no verification is recorded.
  insert into public.passport_evidence
    (subject_type, subject_id, evidence_type, source_kind, source_system, source_ref, producer, artifacts,
     captured_at, integrity, provenance, sensitivity, status, capture_request_id)
  values
    (v.subject_type, v.subject_id, v.evidence_type, 'capture', p_client, v_pkg_id, p_client, v_artifacts,
     (p_package ->> 'captured_at')::timestamptz, p_package -> 'integrity', v_provenance, v_sensitivity, 'received', v.id)
  returning id into v_ev_id;

  update public.passport_capture_requests
     set status = 'completed', completed_at = now(), capture_session_id = coalesce(capture_session_id, p_package ->> 'capture_session_id')
   where id = v.id;

  perform public._passport_emit_event('evidence.created', 'service', p_client, v.subject_type, v.subject_id,
    jsonb_build_object('evidence_id', v_ev_id, 'capture_request_id', v.id),
    jsonb_build_object('evidence_type', v.evidence_type, 'source_kind', 'capture', 'package_id', v_pkg_id, 'artifact_count', jsonb_array_length(v_artifacts)),
    v.correlation_id, p_client);
  perform public._passport_emit_event('capture.completed', 'service', p_client, v.subject_type, v.subject_id,
    jsonb_build_object('capture_request_id', v.id, 'evidence_id', v_ev_id), '{}'::jsonb, v.correlation_id, p_client);

  v_result := jsonb_build_object('ok', true, 'evidence_id', v_ev_id, 'package_id', v_pkg_id, 'capture_request_id', v.id, 'received_at', now());
  insert into public.passport_gateway_receipts (client_id, kind, idempotency_key, object_key, payload_sha256, result)
  values (p_client, 'evidence_package', v_key, v_pkg_id, p_payload_sha256, v_result);
  return v_result || jsonb_build_object('duplicate', false);
end;
$$;

-- R01: least privilege. (SECURITY DEFINER callers run as the function owner and are unaffected.)
revoke execute on function public.passport_capture_related_ok(uuid, text, uuid) from authenticated;

-- perf: passport_claim_explanation() looks a claim's history up by this expression.
create index if not exists passport_events_claim_ref_idx on public.passport_events ((refs ->> 'claim_id'));
