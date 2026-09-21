#!/usr/bin/env bash
# H2-12: parallel / racing attempts cannot produce duplicate or unauthorized authority.
#
# The *.test.sql suites run inside ONE rolled-back transaction, so they cannot exercise real concurrency. This script
# opens genuinely separate database sessions (one `docker exec psql` each) against the THROWAWAY container that
# tests/db/replay.sh created, COMMITS its own fixtures there, and races them. It never touches a hosted project.
#
# Usage: tests/db/h2_concurrency.sh <container-name>      (replay.sh calls this after the DB assertions pass)
set -euo pipefail

NAME="${1:?usage: h2_concurrency.sh <container-name>}"
N="${N:-10}"
psqlc() { docker exec -i "$NAME" psql -U postgres -d postgres -h localhost -tA -X -v ON_ERROR_STOP=1 "$@"; }

uid() { cat /proc/sys/kernel/random/uuid; }   # fresh ids per run: the fixtures are COMMITTED, so a re-run on a kept container must not collide
S=$(uid); OI=$(uid); RI=$(uid); R2=$(uid); ORG=$(uid)   # subject · owner of the independent org · its reviewer · a second principal · the org

# Runs ONE statement as an authenticated end user, exactly as PostgREST would (jwt claims + the real role).
as_user() { # $1 uid, $2 sql
  psqlc -c "select set_config('request.jwt.claim.sub','$1',false), set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\",\"aal\":\"aal1\"}',false); set role authenticated; $2" | tail -n1
}
fail() { echo "H2-12 FAILED: $*" >&2; exit 1; }
expect_eq() { [ "$2" = "$3" ] || fail "$1: expected '$3', got '$2'"; }

echo "h2-concurrency: fixtures"
psqlc -q >/dev/null <<SQL
begin;
insert into auth.users (id, email) values ('$S','cc-s-$S@test.local'), ('$OI','cc-oi-$OI@test.local'), ('$RI','cc-ri-$RI@test.local'), ('$R2','cc-r2-$R2@test.local');
insert into public.organizations (id, owner_id, name) values ('$ORG', '$OI', 'Concurrency Org');
select set_config('flow.internal_write','true',true);   -- transaction-local, like the admin RPC that grants verification
update public.organizations set verified = true where id = '$ORG';
commit;
SQL
as_user "$OI" "select public.passport_assign_authority('$RI','organization','$ORG','evidence_reviewer','{}',array['credential'],now()+interval '30 days')->>'ok'" >/dev/null

new_claim() { # prints claim id
  as_user "$S" "select public.passport_create_claim('person','$S','credential.license','{\"cc\":\"$1\"}','private','standard',null,null,true)->>'id'"
}

# ── 1. N parallel DECISIONS on one request: exactly one wins, the rest are refused as not_pending ─────────────────
CL=$(new_claim decide)
V=$(as_user "$S" "select public.passport_request_verification('$CL','organization_verified','organization','$ORG')->>'id'")
[ -n "$V" ] || fail "fixture: could not open the verification request"
out=$(mktemp); pids=()
for i in $(seq 1 "$N"); do
  ( as_user "$RI" "select coalesce(public.passport_record_verification('$V','verified','documents_checked')->>'reason','ok')" >> "$out" ) & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done
expect_eq "1: exactly one decision succeeded"              "$(grep -c '^ok$' "$out")"          "1"
expect_eq "1: every other attempt was refused not_pending" "$(grep -c '^not_pending$' "$out")" "$((N - 1))"
expect_eq "1: exactly one completed verification row"      "$(psqlc -c "select count(*) from public.passport_verifications where claim_id='$CL' and status='completed'")" "1"
expect_eq "1: exactly one verification.completed audit event" "$(psqlc -c "select count(*) from public.passport_events where event_type='verification.completed' and refs->>'claim_id'='$CL'")" "1"
expect_eq "1: the claim is verified once" "$(psqlc -c "select status from public.passport_claims where id='$CL'")" "verified"
echo "  ok  1: $N parallel decisions -> 1 winner, $((N - 1)) refused, 1 row, 1 event"

# ── 2. N parallel REQUESTS for the same claim+verifier: one open request, never duplicates ────────────────────────
CL2=$(new_claim request)
out=$(mktemp); pids=()
for i in $(seq 1 "$N"); do
  ( as_user "$S" "select coalesce(public.passport_request_verification('$CL2','organization_verified','organization','$ORG')->>'reason','ok')" >> "$out" ) & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done
expect_eq "2: exactly one request opened" "$(grep -c '^ok$' "$out")" "1"
expect_eq "2: exactly one OPEN verification row" "$(psqlc -c "select count(*) from public.passport_verifications where claim_id='$CL2' and status='requested'")" "1"
echo "  ok  2: $N parallel requests -> 1 open request"

# ── 3. N parallel authority ASSIGNMENTS of the same (principal, entity, type): one active assignment ───────────────
out=$(mktemp); pids=()
for i in $(seq 1 "$N"); do
  ( as_user "$OI" "select coalesce(public.passport_assign_authority('$R2','organization','$ORG','evidence_reviewer','{}',array['credential'],now()+interval '30 days')->>'reason','ok')" >> "$out" ) & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || true; done
expect_eq "3: exactly one assignment created" "$(grep -c '^ok$' "$out")" "1"
expect_eq "3: exactly one ACTIVE assignment row" "$(psqlc -c "select count(*) from public.passport_authority_assignments where principal_id='$R2' and entity_id='$ORG' and status='active'")" "1"
echo "  ok  3: $N parallel assignments -> 1 active assignment"

# ── 4. a LONG-LIVED connection sees a committed revocation immediately (no per-session authority cache) ─────────────
# Session RI stays open, asks "do I hold authority?", waits, asks again. Meanwhile a DIFFERENT session commits the revocation.
CL4=$(new_claim stale)
V4=$(as_user "$S" "select public.passport_request_verification('$CL4','organization_verified','organization','$ORG')->>'id'")
AID=$(psqlc -c "select id from public.passport_authority_assignments where principal_id='$RI' and entity_id='$ORG' and status='active' limit 1")
long=$(mktemp)
( docker exec -i "$NAME" psql -U postgres -d postgres -h localhost -tA -X -v ON_ERROR_STOP=1 >"$long" <<SQL
select set_config('request.jwt.claim.sub','$RI',false), set_config('request.jwt.claims','{"sub":"$RI","role":"authenticated","aal":"aal1"}',false);
set role authenticated;
select public.passport_has_authority('organization','$ORG','evidence_reviewer',null,'credential.license')::text;
select pg_sleep(3);
select public.passport_has_authority('organization','$ORG','evidence_reviewer',null,'credential.license')::text;
select coalesce(public.passport_record_verification('$V4','verified','documents_checked')->>'reason','ok');
SQL
) &
sleep 1
as_user "$OI" "select public.passport_revoke_authority('$AID','stale-check')->>'ok'" >/dev/null   # committed from another connection
wait
expect_eq "4: the open connection held authority before the revocation, lost it after, and was refused the decision" \
  "$(grep -E '^(true|false|ok|not_authorized)$' "$long" | tr '\n' ' ')" "true false not_authorized "
expect_eq "4: nothing was verified" "$(psqlc -c "select status from public.passport_claims where id='$CL4'")" "under_review"
echo "  ok  4: a committed revocation is visible to an already-open session at once"

echo "h2-concurrency: all parallel-session checks passed"
