#!/usr/bin/env bash
# End-to-end rig for the Passport Integration Gateway. Builds, from nothing:
#
#   throwaway Postgres (all migrations replayed)  ->  PostgREST  ->  a tiny
#   /rest/v1 prefix proxy (what Supabase's gateway does)  ->  the REAL Next
#   dev server (route handlers, service-role client)  ->  signed HTTP calls
#   from tests/e2e/passport-gateway.e2e.test.ts
#
# Needs Docker and the images tests/db/replay.sh uses (+ PostgREST). Uses only
# throwaway containers and locally generated throwaway secrets — never a hosted
# project, never a real credential. NOT part of `npm run test` or CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
REST_IMAGE="${REST_IMAGE:-public.ecr.aws/supabase/postgrest:v16.2}"
SUFFIX="$$"
DB="flow-e2e-pg-$SUFFIX"
REST="flow-e2e-rest-$SUFFIX"
JWT_SECRET="e2e-throwaway-jwt-secret-at-least-32-characters-long-$SUFFIX"
CLIENT_SECRET="e2e-throwaway-client-secret-0123456789-$SUFFIX-abcdef"
PROXY_PORT=54399
NEXT_PORT=3111
PIDS=()

for port in "$PROXY_PORT" "$NEXT_PORT"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    echo "port $port is already in use (a stale rig?). Stop it and retry." >&2
    exit 1
  fi
done

cleanup() {
  # Kill whole process groups: `npx` spawns the real server as a CHILD, and killing only
  # the wrapper leaves an orphan bound to the port (a stale server with stale secrets).
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && { kill -- "-$pid" >/dev/null 2>&1 || kill "$pid" >/dev/null 2>&1 || true; }; done
  docker rm -f "$DB" "$REST" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_super() { docker exec -i "$DB" psql -U supabase_admin -d postgres -h localhost -v ON_ERROR_STOP=1 -q -X "$@"; }
psql_app() { docker exec -i "$DB" psql -U postgres -d postgres -h localhost -v ON_ERROR_STOP=1 -q -X "$@"; }
jwt() { # jwt '<claims-json>'
  JWT_SECRET="$JWT_SECRET" CLAIMS="$1" node -e '
    const c=require("crypto"), b=(x)=>Buffer.from(x).toString("base64url");
    const h=b(JSON.stringify({alg:"HS256",typ:"JWT"})), p=b(JSON.stringify({...JSON.parse(process.env.CLAIMS),exp:Math.floor(Date.now()/1000)+3600}));
    process.stdout.write(h+"."+p+"."+b(c.createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest()));'
}

echo "== database"
docker run -d --name "$DB" -e POSTGRES_PASSWORD=postgres "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
sleep 3
psql_super < "$ROOT/tests/db/shims.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psql_app < "$f"; done
psql_super -c "alter role authenticator with password 'postgres'"
psql_app <<'SQL'
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'subject@e2e.local'),
  ('b0000000-0000-4000-8000-000000000002', 'other@e2e.local');
SQL

echo "== postgrest"
DB_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$DB")"
docker run -d --name "$REST" -e PGRST_DB_URI="postgres://authenticator:postgres@$DB_IP:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" -e PGRST_SERVER_PORT=3000 "$REST_IMAGE" >/dev/null
REST_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$REST")"
for _ in $(seq 1 30); do curl -sf "http://$REST_IP:3000/" >/dev/null 2>&1 && break; sleep 1; done

echo "== /rest/v1 proxy"
export T="$REST_IP" P="$PROXY_PORT"
setsid node -e '
  const http=require("http");
  http.createServer((req,res)=>{
    const p=http.request({host:process.env.T,port:3000,method:req.method,path:req.url.replace(/^\/rest\/v1/,"")||"/",headers:{...req.headers,host:process.env.T+":3000"}},(r)=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
    p.on("error",()=>{res.statusCode=502;res.end()}); req.pipe(p);
  }).listen(Number(process.env.P),"127.0.0.1");' &
PIDS+=($!)
sleep 1

echo "== next"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$PROXY_PORT"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(jwt '{"role":"anon"}')"
export SUPABASE_SERVICE_ROLE_KEY="$(jwt '{"role":"service_role"}')"
export PASSPORT_GATEWAY_CLIENTS="[{\"client_id\":\"flow_capture\",\"key_id\":\"k1\",\"secret\":\"$CLIENT_SECRET\",\"scopes\":[\"capture_requests:read\",\"capture_requests:report\",\"evidence_packages:write\",\"evidence:read\"]}]"
export NEXT_PUBLIC_FLOW_DEMO_MODE=false
(cd "$ROOT" && exec setsid npx next dev -p "$NEXT_PORT" >"$ROOT/.next-e2e.log" 2>&1) &
PIDS+=($!)
for _ in $(seq 1 90); do curl -s -o /dev/null "http://127.0.0.1:$NEXT_PORT/api/passport/v2/evidence/00000000-0000-4000-8000-000000000000" && break; sleep 2; done

if [ "${E2E_HOLD:-0}" = "1" ]; then
  echo "rig held open. BASE=http://127.0.0.1:$NEXT_PORT REST=http://127.0.0.1:$PROXY_PORT"
  echo "CLIENT_SECRET=$CLIENT_SECRET"; echo "JWT_SECRET=$JWT_SECRET"
  sleep "${E2E_HOLD_SECONDS:-600}"
fi

echo "== tests"
cd "$ROOT"
E2E_BASE_URL="http://127.0.0.1:$NEXT_PORT" E2E_REST_URL="http://127.0.0.1:$PROXY_PORT" E2E_CLIENT_SECRET="$CLIENT_SECRET" E2E_JWT_SECRET="$JWT_SECRET" \
  npx vitest run tests/e2e/passport-gateway.e2e.test.ts
