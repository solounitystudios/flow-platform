#!/usr/bin/env bash
# Fresh-replay + DB assertion runner for supabase/migrations.
#
# Starts a THROWAWAY local Postgres (the same image family Supabase runs),
# applies every migration in filename order against an empty database, then
# runs every tests/db/*.test.sql assertion file. Never connects to any hosted
# Supabase project and never reads real credentials — the container password
# below is a local-only throwaway.
#
# Usage: tests/db/replay.sh            # replay + assertions
#        KEEP=1 tests/db/replay.sh     # leave the container running after
set -euo pipefail

IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
NAME="flow-pg-replay-$$"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PSQL=(docker exec -i "$NAME" psql -U postgres -d postgres -h localhost -v ON_ERROR_STOP=1 -q -X)

cleanup() { [ "${KEEP:-0}" = "1" ] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break
  sleep 2
done
# The image restarts once during init; wait for a stable ready state.
sleep 3
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break
  sleep 1
done

# The auth schema is owned by supabase_auth_admin; the shim needs the image's
# superuser. Migrations themselves run as `postgres`, like hosted Supabase.
docker exec -i "$NAME" psql -U supabase_admin -d postgres -h localhost -v ON_ERROR_STOP=1 -q -X < "$ROOT/tests/db/shims.sql"

count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "replay: $(basename "$f")"
  "${PSQL[@]}" < "$f"
  count=$((count + 1))
done
echo "replayed $count migrations OK"

fail=0
for t in "$ROOT"/tests/db/*.test.sql; do
  [ -e "$t" ] || continue
  echo "assert: $(basename "$t")"
  if ! cat "$ROOT/tests/db/_helpers.sql" "$t" | "${PSQL[@]}"; then fail=1; fi
done
[ "$fail" = "0" ] && echo "DB assertions OK" || { echo "DB assertions FAILED"; exit 1; }

# Real parallel sessions (H2-12) can't run inside a single rolled-back transaction. This commits its own fixtures into
# the same THROWAWAY container (and the ledger is append-only), so it runs last — and is skipped for a KEPT container, which
# is meant to stay pristine for the suites, the review repros and the mutation runner (opt back in with CONCURRENCY=1).
if [ "${KEEP:-0}" != "1" ] || [ "${CONCURRENCY:-0}" = "1" ]; then
  echo "concurrency: h2_concurrency.sh"
  bash "$ROOT/tests/db/h2_concurrency.sh" "$NAME" || { echo "DB concurrency checks FAILED"; exit 1; }
  echo "DB concurrency OK"
else
  echo "concurrency: skipped (KEEP=1 keeps the database pristine; CONCURRENCY=1 to include it)"
fi
# An `[ ... ] && echo` as the last line would make a successful run exit 1 whenever KEEP is unset.
if [ "${KEEP:-0}" = "1" ]; then echo "container kept: $NAME"; fi
