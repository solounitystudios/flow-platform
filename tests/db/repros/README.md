# Passport V2 review reproductions

These are **not** part of the CI/replay gate (`tests/db/replay.sh` only runs `tests/db/*.test.sql`, non-recursively).
They are executable evidence for the independent security review (`docs/security/passport-v2-independent-review.md`).

```bash
KEEP=1 tests/db/replay.sh                     # prints "container kept: <name>"
NAME=<name>
cat tests/db/_helpers.sql tests/db/repros/passport_v2_review_attacks.repro.sql \
  | docker exec -i $NAME psql -U postgres -d postgres -h localhost -q -X -v ON_ERROR_STOP=0 2>&1 | grep RESULT
tests/db/repros/concurrency.sh $NAME          # real parallel sessions: nonce replay + idempotency
docker rm -f $NAME
```

Every probe prints `RESULT <id>: SECURE | VULNERABLE | INFO`. Everything runs in a rolled-back transaction against a
**throwaway** local Postgres. `concurrency.sh` commits rows, but only into that same throwaway container.

Against the stack **without** `20260919120700_passport_v2_review_fixes.sql` the expected `VULNERABLE` results are
R01, R04a, R05a-c, R06a-c, R09c, R09e and R11. With the fix migration R01, R05*, R06c become `SECURE`; R04a, R06a/b,
R09c/e and R11 remain open by design (they need a policy/schema decision; R11 is mitigated at the app layer).

Lessons baked into these scripts (each cost a wrong first answer during the review): every probe needs a **control**
proving the fixture works, because "denied" is meaningless if the fixture was broken, and a `WHERE` that matches zero
rows never fires a row-level guard trigger.
