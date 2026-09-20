#!/usr/bin/env bash
# Real-concurrency probes for the gateway's replay protection and idempotency.
# Needs a replayed throwaway container that is still running:
#   KEEP=1 tests/db/replay.sh          # prints "container kept: <name>"
#   tests/db/repros/concurrency.sh <name>
# Writes committed rows into that THROWAWAY database only (never a hosted project).
set -uo pipefail
NAME="${1:?usage: concurrency.sh <container-name>}"
P=(docker exec -i "$NAME" psql -U postgres -d postgres -h localhost -q -X -At)
S='a0000000-0000-4000-8000-0000000c0001'
"${P[@]}" <<SQL >/dev/null
insert into auth.users (id, email) values ('$S', 'conc@test.local') on conflict do nothing;
SQL

echo "== 1. NONCE: 30 parallel consumers race for ONE nonce (expect exactly 1 true)"
NONCE="nonce-race-$(date +%s)-0123456789"
for i in $(seq 1 30); do
  "${P[@]}" -c "set role service_role; select public.passport_gateway_consume_nonce('flow_capture', '$NONCE');" > /tmp/nonce.$i.out 2>&1 &
done; wait
trues=$(cat /tmp/nonce.*.out | grep -c '^t$'); falses=$(cat /tmp/nonce.*.out | grep -c '^f$'); errs=$(cat /tmp/nonce.*.out | grep -ciE 'error|fatal')
echo "   true=$trues false=$falses errors=$errs  => $([ "$trues" = 1 ] && [ "$errs" = 0 ] && echo SECURE || echo VULNERABLE)"
rm -f /tmp/nonce.*.out

echo "== 2. IDEMPOTENCY: 12 parallel deliveries of the SAME package (expect exactly 1 evidence row)"
RID=$("${P[@]}" -c "select set_config('request.jwt.claim.sub','$S',false); set role authenticated; select (public.passport_create_capture_request('person','$S','skill_evidence','photo','conc-req-$(date +%s)') ->> 'id');" | tail -1)
PKG=$(cat <<JSON
select jsonb_build_object('schema_version','1.0','package_id','11111111-1111-4111-8111-1111111111c1','producer','flow_capture','capture_request_id','$RID','subject',jsonb_build_object('type','person','id','$S'),'capture_session_id','sess-1','captured_at',now(),'artifacts',jsonb_build_array(jsonb_build_object('artifact_id','art-1','kind','photo','media_type','image/jpeg','storage',jsonb_build_object('provider','flow_capture','ref','capture://s/1'))),'source_metadata','{}'::jsonb,'provenance',jsonb_build_object('producer_version','0.1.0'),'correlation_id','c','idempotency_key','conc-idem-0001')
JSON
)
for i in $(seq 1 12); do
  "${P[@]}" -c "set role service_role; select public.passport_gateway_ingest_evidence_package('flow_capture', ($PKG), repeat('1',64)) ->> 'ok' || ':' || coalesce(public.passport_gateway_ingest_evidence_package('flow_capture', ($PKG), repeat('1',64)) ->> 'duplicate', coalesce(public.passport_gateway_ingest_evidence_package('flow_capture', ($PKG), repeat('1',64)) ->> 'reason','?'));" > /tmp/ing.$i.out 2>&1 &
done; wait
rows=$("${P[@]}" -c "select count(*) from public.passport_evidence where source_ref = '11111111-1111-4111-8111-1111111111c1' and producer = 'flow_capture';")
events=$("${P[@]}" -c "select count(*) from public.passport_events where event_type = 'evidence.created' and refs ->> 'capture_request_id' = '$RID';")
echo "   evidence rows=$rows  evidence.created events=$events  errors=$(cat /tmp/ing.*.out | grep -ciE 'error|fatal|deadlock')  => $([ "$rows" = 1 ] && [ "$events" = 1 ] && echo SECURE || echo VULNERABLE)"
echo "   distinct outcomes: $(cat /tmp/ing.*.out | sort | uniq -c | tr '\n' ';')"
rm -f /tmp/ing.*.out

echo "== 3. SAME package_id under 12 DIFFERENT idempotency keys (expect still 1 evidence row)"
for i in $(seq 1 12); do
  "${P[@]}" -c "set role service_role; select public.passport_gateway_ingest_evidence_package('flow_capture', (($PKG) || jsonb_build_object('idempotency_key','conc-idem-k$i')), repeat('1',64)) ->> 'ok';" > /tmp/k.$i.out 2>&1 &
done; wait
rows=$("${P[@]}" -c "select count(*) from public.passport_evidence where source_ref = '11111111-1111-4111-8111-1111111111c1' and producer = 'flow_capture';")
echo "   evidence rows=$rows => $([ "$rows" = 1 ] && echo SECURE || echo VULNERABLE)"; rm -f /tmp/k.*.out
