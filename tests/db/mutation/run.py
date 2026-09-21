#!/usr/bin/env python3
"""Mutation check for the Passport H2 / M1 controls.

A green suite only proves the happy path if it can also FAIL. This script deliberately breaks one control at a time in a
THROWAWAY database (the container tests/db/replay.sh kept with KEEP=1), runs the DB suites, and requires at least one to fail.
A mutant that SURVIVES means a control is not actually pinned by any test.

    KEEP=1 tests/db/replay.sh                       # prints "container kept: <name>"
    tests/db/mutation/run.py <container-name>       # exits non-zero if any mutant survives

Never connects to a hosted project. Every mutant is restored (the original definition/privilege is re-applied) before the
next one, and a final run of the unmutated suites proves the database was left intact.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CONTAINER = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
SUITES = ["passport_v2_core", "passport_v2_h2_org_control", "passport_v2_m1_public_projection", "passport_v2_explanation", "passport_v2_consent_relationships"]


def psql(sql: str, *, stdin_prefix: str = "") -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-h", "localhost", "-X", "-q", "-v", "ON_ERROR_STOP=1"],
        input=stdin_prefix + sql, text=True, capture_output=True,
    )


def funcdef(signature: str) -> str:
    out = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-h", "localhost", "-X", "-tA", "-c", f"select pg_get_functiondef('{signature}'::regprocedure)"],
        text=True, capture_output=True, check=True).stdout
    return out.strip() + ";\n"


def run_suites() -> list[str]:
    """Names of the suites that FAILED (empty list == every suite green)."""
    helpers = (ROOT / "tests/db/_helpers.sql").read_text()
    failed = []
    for s in SUITES:
        r = psql((ROOT / f"tests/db/{s}.test.sql").read_text(), stdin_prefix=helpers)
        if r.returncode != 0:
            failed.append(s)
    return failed


def first_failure(suite_hint: list[str]) -> str:
    return ", ".join(suite_hint) or "-"


# (id, human description, function signature, transform(definition)->mutated definition | None, optional raw sql applied instead)
def sub(pattern: str, repl: str, *, count: int = 1, flags: int = re.S):
    def f(d: str) -> str:
        new, n = re.subn(pattern, repl, d, count=count, flags=flags)
        assert n >= 1, f"mutation pattern did not match: {pattern!r}"
        return new
    return f


MUTANTS = [
    # ── H2: independence over CONTROL ──────────────────────────────────────────────────────────────────────
    ("H2-a", "organization verifier is ALWAYS independent (control-set check removed)", "public.passport_verifier_independent(text,uuid,text,uuid)",
     sub(r"and not exists \(\s*select 1 from public\.passport_org_controllers\(p_verifier_id\) c\s*where public\.passport_controls\(c\.principal_id, p_subject_type, p_subject_id\)\)", ""), None),
    ("H2-b", "an active ADMIN member no longer counts as control", "public.passport_org_controllers(uuid)",
     sub(r"m\.role in \('owner', 'admin'\)", "m.role in ('owner')"), None),
    ("H2-c", "a live authority assignment no longer counts as control", "public.passport_org_controllers(uuid)",
     sub(r"union\s+select a\.principal_id from public\.passport_authority_assignments a.*?\(a\.expires_at is null or a\.expires_at > now\(\)\)", ""), None),
    ("H2-d", "organizations.owner_id no longer counts as control", "public.passport_org_controllers(uuid)",
     sub(r"select o\.owner_id from public\.organizations o where o\.id = p_org_id and o\.owner_id is not null\s+union", ""), None),
    ("H2-e", "independence not re-checked at DECISION time", "public.passport_record_verification(uuid,text,text,timestamp with time zone)",
     sub(r"if not public\.passport_verifier_independent\(v_claim\.subject_type, v_claim\.subject_id, v_ver\.verifier_type, v_ver\.verifier_id\) then\s+return[^;]+;\s+end if;", ""), None),
    ("H2-f", "organizations.verified not re-checked at DECISION time", "public.passport_record_verification(uuid,text,text,timestamp with time zone)",
     sub(r"if v_ver\.verifier_type = 'organization' and not public\.passport_org_is_verified\(v_ver\.verifier_id\) then\s+return[^;]+;\s+end if;", ""), None),
    ("H2-g", "organizations.verified not required at REQUEST time", "public.passport_request_verification(uuid,text,text,uuid)",
     sub(r"if p_verifier_type = 'organization' and not public\.passport_org_is_verified\(p_verifier_id\) then\s+return[^;]+;\s+end if;", ""), None),
    ("H2-h", "a decider who CONTROLS the subject is allowed (self_verification check narrowed to ownership)", "public.passport_record_verification(uuid,text,text,timestamp with time zone)",
     sub(r"\s+or public\.passport_controls\(auth\.uid\(\), v_claim\.subject_type, v_claim\.subject_id\)", ""), None),
    ("H2-i", "claims guard trigger stops requiring an INDEPENDENT decision (privileged writer can verify)", "public.passport_claims_guard()",
     sub(r"\s+and public\.passport_verifier_independent\(new\.subject_type, new\.subject_id, v\.verifier_type, v\.verifier_id\)", ""), None),
    ("H2-j", "claims guard trigger stops requiring a FLOW-verified org", "public.passport_claims_guard()",
     sub(r"\s+and \(v\.verifier_type <> 'organization' or public\.passport_org_is_verified\(v\.verifier_id\)\)", ""), None),
    ("H2-k", "a decided verification can be decided AGAIN (replay)", "public.passport_record_verification(uuid,text,text,timestamp with time zone)",
     sub(r"if v_ver\.status <> 'requested' then\s+return[^;]+;\s+end if;", ""), None),
    ("H2-l", "REVOKED authority still honoured", "public.passport_has_authority(text,uuid,text,text,text)",
     sub(r"a\.status = 'active'", "a.status in ('active', 'revoked')"), None),
    ("H2-m", "EXPIRED authority still honoured", "public.passport_has_authority(text,uuid,text,text,text)",
     sub(r"\s+and \(a\.expires_at is null or a\.expires_at > now\(\)\)", ""), None),
    ("H2-n", "authority for ANY org accepted (entity binding dropped)", "public.passport_has_authority(text,uuid,text,text,text)",
     sub(r"\s+and a\.entity_id = p_entity_id", ""), None),
    ("H2-r", "authority that has NOT STARTED yet is honoured", "public.passport_has_authority(text,uuid,text,text,text)",
     sub(r"\s+and a\.starts_at <= now\(\)", ""), None),
    ("H2-s", "authority SCOPE (claim-type prefixes) ignored", "public.passport_has_authority(text,uuid,text,text,text)",
     sub(r"p_claim_type is null\s+or jsonb_array_length", "true or jsonb_array_length"), None),
    ("H2-t", "a peer request can be decided by ANYONE (peer binding dropped)", "public.passport_can_act_as_verifier(text,uuid,text,text)",
     sub(r"return p_verifier_type = 'person' and p_verifier_id = auth\.uid\(\);", "return true;"), None),
    ("H2-o", "control helper executable by any signed-in user", None, None,
     "grant execute on function public.passport_org_controllers(uuid) to authenticated;"),
    ("H2-p", "control helper executable by anon", None, None,
     "grant execute on function public.passport_verifier_independent(text,uuid,text,uuid) to anon;"),
    ("H2-q", "anon may call the verification decision RPC", None, None,
     "grant execute on function public.passport_record_verification(uuid,text,text,timestamptz) to anon;"),
    # ── M1: public projection is an ALLOW-list ─────────────────────────────────────────────────────────────
    ("M1-a", "projection stops requiring a Passport-derived (flow_platform) claim", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\s+and c\.source_system = 'flow_platform'", ""), None),
    ("M1-b", "projection stops requiring standard sensitivity", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\s+and c\.sensitivity = 'standard'", ""), None),
    ("M1-c", "projection stops requiring a PUBLIC Passport (public switch / block rules)", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\s+and public\.passport_subject_is_public\('person', c\.subject_id\)[^\n]*", ""), None),
    ("M1-d", "projection lists ACROSS people when no id is given (bulk directory)", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\(p_profile_id is not null or p_claim_id is not null\)", "true"), None),
    ("M1-e", "projection stops requiring verified status", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\s+and c\.status = 'verified'", ""), None),
    ("M1-f", "projection ignores claim expiry", "public.passport_public_claims(uuid,uuid,integer)",
     sub(r"\s+and \(c\.expires_at is null or c\.expires_at > now\(\)\)", ""), None),
    ("M1-g", "value filter passes the WHOLE raw value through (blacklist instead of allow-list)", "public.passport_public_claim_value(text,jsonb)",
     sub(r"select case p_claim_type.*?end;", "select p_value;"), None),
    ("M1-h", "an UNLISTED claim type stops being default-deny", "public.passport_public_claim_value(text,jsonb)",
     sub(r"else '\{\}'::jsonb", "else p_value"), None),
    ("M1-i", "anon can SELECT the raw claims table", None, None,
     "grant select on public.passport_claims to anon;"),
    ("M1-j", "anon can SELECT the evidence table", None, None,
     "grant select on public.passport_evidence to anon;"),
    ("M1-k", "a raw-row-returning function is left executable by anon", None, None,
     "create function public.passport_leak_claim(p uuid) returns setof public.passport_claims language sql stable security definer set search_path = pg_catalog, public as $$ select * from public.passport_claims where id = p $$; grant execute on function public.passport_leak_claim(uuid) to anon;"),
    ("M1-l", "explanation treats the PUBLIC viewer as a full viewer", "public.passport_claim_explanation(uuid)",
     sub(r"v_full := v_viewer in \('owner', 'admin', 'reviewer'\);", "v_full := true;"), None),
    ("M1-m", "explanation's public branch stops delegating to the projection", "public.passport_claim_explanation(uuid)",
     sub(r"elsif exists \(select 1 from public\.passport_public_claims\(null, v_claim\.id, 1\)\) then", "elsif v_claim.visibility = 'public' then"), None),
    ("M1-n", "explanation reveals the external issuer free-text label to the public", "public.passport_claim_explanation(uuid)",
     sub(r"case when v_full then v_claim\.issuer_label else null end", "v_claim.issuer_label"), None),
    ("M1-o", "explanation reveals the source_ref to the public", "public.passport_claim_explanation(uuid)",
     sub(r"case when v_viewer in \('owner', 'admin'\) then v_claim\.source_ref else null end", "v_claim.source_ref"), None),
    # ── disclosure at the point of use ─────────────────────────────────────────────────────────────────────
    ("D-a", "disclosure ignores a REVOKED grant", "public.passport_disclose(uuid,text,text,text)",
     sub(r"if v_grant\.status <> 'active' then\s+return[^;]+;\s+end if;", ""), None),
    ("D-b", "disclosure ignores an EXPIRED grant (before any sweep)", "public.passport_disclose(uuid,text,text,text)",
     sub(r"if v_grant\.expires_at <= now\(\) then\s+return[^;]+;\s+end if;", ""), None),
    ("D-c", "disclosure lets a non-grantee use the grant", "public.passport_disclose(uuid,text,text,text)",
     sub(r"if not found or not public\.passport_can_request_as\(v_grant\.grantee_type, v_grant\.grantee_id, v_grant\.purpose\) then", "if not found then"), None),
]


def apply(mutant) -> str | None:
    """Apply the mutation; return the original definition (for restore) or None for raw-SQL mutants."""
    mid, _, sig, transform, raw = mutant
    if raw:
        r = psql(raw)
        assert r.returncode == 0, f"{mid}: raw mutation failed: {r.stderr}"
        return None
    original = funcdef(sig)
    mutated = transform(original)
    assert mutated != original, f"{mid}: mutation changed nothing"
    r = psql(mutated)
    assert r.returncode == 0, f"{mid}: mutated definition rejected: {r.stderr[:300]}"
    return original


def restore(mutant, original: str | None) -> None:
    mid, _, sig, _, raw = mutant
    if raw:
        undo = {
            "H2-o": "revoke execute on function public.passport_org_controllers(uuid) from authenticated;",
            "H2-p": "revoke execute on function public.passport_verifier_independent(text,uuid,text,uuid) from anon;",
            "H2-q": "revoke execute on function public.passport_record_verification(uuid,text,text,timestamptz) from anon;",
            "M1-i": "revoke all on public.passport_claims from anon;",
            "M1-j": "revoke all on public.passport_evidence from anon;",
            "M1-k": "drop function if exists public.passport_leak_claim(uuid);",
        }[mid]
        assert psql(undo).returncode == 0, f"{mid}: restore failed"
        return
    assert psql(original).returncode == 0, f"{mid}: restore failed"


def main() -> int:
    baseline = run_suites()
    if baseline:
        print(f"ABORT: the UNMUTATED suites already fail: {baseline}")
        return 2
    print(f"baseline green ({len(SUITES)} suites). Running {len(MUTANTS)} mutants...\n")
    survived = []
    for m in MUTANTS:
        original = apply(m)
        try:
            failed = run_suites()
        finally:
            restore(m, original)
        status = "KILLED " if failed else "SURVIVED"
        print(f"  {status} {m[0]:5} {m[1]}   [{first_failure(failed)}]")
        if not failed:
            survived.append(m[0])
    final = run_suites()
    print(f"\nafter restore, unmutated suites: {'green' if not final else 'FAILED ' + str(final)}")
    print(f"{len(MUTANTS) - len(survived)}/{len(MUTANTS)} mutants killed" + (f"; SURVIVORS: {survived}" if survived else ""))
    return 1 if (survived or final) else 0


if __name__ == "__main__":
    sys.exit(main())
