import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ACTOR_TYPES,
  ARTIFACT_KINDS,
  AUTHORITY_SOURCES,
  AUTHORITY_STATUSES,
  AUTHORITY_TYPES,
  CLAIM_STATUSES,
  CAPTURE_EVIDENCE_TYPES,
  CAPTURE_FAILURE_REASONS,
  CAPTURE_PURPOSES,
  CAPTURE_RELATED_TYPES,
  CAPTURE_REQUEST_STATUSES,
  CLAIM_VISIBILITIES,
  CONNECTION_ERROR_CATEGORIES,
  CONNECTION_STATUSES,
  CONSENT_BASES,
  CONSENT_PURPOSES,
  CaptureRequest,
  DATA_POLICIES,
  EvidenceSummary,
  GATEWAY_ERRORS,
  CONSENT_STATUSES,
  DATA_CATEGORIES,
  EVIDENCE_SOURCE_KINDS,
  EVIDENCE_STATUSES,
  EVIDENCE_TYPES,
  PASSPORT_EVENT_TYPES,
  RELATIONSHIP_STATUSES,
  RELATION_TYPES,
  SENSITIVITIES,
  SUBJECT_TYPES,
  VERIFICATION_METHODS,
} from "@flow/passport-contracts";
import {
  CAPTURE_TRANSITIONS,
  CLAIM_TRANSITIONS,
  CONSENT_TRANSITIONS,
  PURPOSE_ALLOWED_CATEGORIES,
  RELATIONSHIP_TRANSITIONS,
  PUBLIC_VALUE_FIELDS,
  RELATION_RULES,
  VERIFICATION_METHOD_POLICY,
  claimCategoryFor,
} from "@/lib/passport/domain";
import { passportReasonMessage } from "@/lib/passport/data";

/**
 * The database is the enforcement point for Passport rules; TypeScript holds
 * mirrors of some tables (lifecycle maps, method policy, vocabularies). These
 * tests parse the Passport V2 migrations and fail when a mirror drifts, so a
 * rule can never mean one thing in SQL and another in the UI/contracts.
 */
const dir = path.resolve(__dirname, "../../supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => /_passport_v2_.*\.sql$/.test(f)).sort();
const sql = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");

/** Reads the quoted values of the `... in ( 'a', 'b', ... )` list that follows `anchor`. */
function quotedListAfter(anchor: string, withinTable?: string): string[] {
  const scope = withinTable ? sql.indexOf(`create table public.${withinTable} (`) : 0;
  expect(scope, `table not found in migrations: ${withinTable}`).toBeGreaterThan(-1);
  const at = sql.indexOf(anchor, scope);
  expect(at, `anchor not found in migrations: ${anchor}`).toBeGreaterThan(-1);
  let depth = 1;
  let i = at + anchor.length;
  const start = i;
  for (; i < sql.length && depth > 0; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
  }
  return [...sql.slice(start, i - 1).matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

const sorted = (values: readonly string[]) => [...values].sort();

function functionBody(name: string): string {
  const at = sql.indexOf(`create or replace function public.${name}(`);
  expect(at, `function ${name} not found`).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("$$;", sql.indexOf("as $$", at)));
}

describe("SQL <-> contracts vocabulary parity", () => {
  it("event types", () => expect(quotedListAfter("event_type text not null check (event_type in (")).toEqual(sorted(PASSPORT_EVENT_TYPES)));
  it("event actor types", () => expect(quotedListAfter("actor_type text not null check (actor_type in (")).toEqual(sorted(ACTOR_TYPES)));
  it("claim statuses", () => expect(quotedListAfter("status text not null default 'draft' check (status in (", "passport_claims")).toEqual(sorted(CLAIM_STATUSES)));
  it("claim visibility", () => expect(quotedListAfter("visibility text not null default 'private' check (visibility in (")).toEqual(sorted(CLAIM_VISIBILITIES)));
  it("claim sensitivity", () => expect(quotedListAfter("sensitivity text not null default 'standard' check (sensitivity in (")).toEqual(sorted(SENSITIVITIES)));
  it("evidence types", () => expect(quotedListAfter("evidence_type text not null check (evidence_type in (")).toEqual(sorted(EVIDENCE_TYPES)));
  it("evidence source kinds", () => expect(quotedListAfter("source_kind text not null check (source_kind in (")).toEqual(sorted(EVIDENCE_SOURCE_KINDS)));
  it("evidence statuses", () => expect(quotedListAfter("status text not null default 'received' check (status in (", "passport_evidence")).toEqual(sorted(EVIDENCE_STATUSES)));
  it("verification methods", () => expect(quotedListAfter("method text not null check (method in (")).toEqual(sorted(VERIFICATION_METHODS)));
  it("authority types", () => expect(quotedListAfter("authority_type text not null check (authority_type in (")).toEqual(sorted(AUTHORITY_TYPES)));
  it("authority sources", () => expect(quotedListAfter("source text not null default 'assigned' check (source in (")).toEqual(sorted(AUTHORITY_SOURCES)));
  it("authority statuses", () => expect(quotedListAfter("status text not null default 'active' check (status in (", "passport_authority_assignments")).toEqual(sorted(AUTHORITY_STATUSES)));

  it("persisted subject types are the contract's, minus the 'business' alias", () => {
    expect(quotedListAfter("select p_type in (")).toEqual(sorted(SUBJECT_TYPES.filter((t) => t !== "business")));
  });

  it("verifier types are subject types plus 'system'", () => {
    const verifierTypes = quotedListAfter("verifier_type text not null check (verifier_type in (");
    for (const type of verifierTypes) expect([...SUBJECT_TYPES, "system"]).toContain(type);
  });

  it("artifact kinds and providers accepted by the SQL validator match the contract", () => {
    const body = functionBody("passport_artifacts_valid");
    const kinds = [...(body.match(/'kind', ''\) not in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(kinds).toEqual(sorted(ARTIFACT_KINDS));
    const providers = [...(body.match(/'provider', ''\) not in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(providers).toEqual(["external", "flow_capture", "flow_storage"]);
  });
});

describe("SQL <-> domain policy parity", () => {
  it("claim transitions", () => {
    const pairs = [...functionBody("passport_claim_transition_allowed").matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const expected = Object.entries(CLAIM_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(expected);
  });

  it("verification method policy", () => {
    const rows = [...functionBody("passport_method_policy").matchAll(/\('([a-z_]+)', (true|false), (true|false), (null::text|'[a-z_]+'::text), (true|false), (true|false)\)/g)];
    expect(rows.map((r) => r[1]).sort()).toEqual(sorted(VERIFICATION_METHODS));
    for (const [, method, canYield, independent, authority, platformAdmin, available] of rows) {
      const policy = VERIFICATION_METHOD_POLICY[method as keyof typeof VERIFICATION_METHOD_POLICY];
      expect({ canYield: canYield === "true", independent: independent === "true", authority: authority === "null::text" ? null : authority.slice(1, authority.indexOf("'", 1)), platformAdmin: platformAdmin === "true", available: available === "true" }, method).toEqual({
        canYield: policy.canYieldVerified,
        independent: policy.independentVerifier,
        authority: policy.requiredAuthority,
        platformAdmin: policy.platformAdmin,
        available: policy.available,
      });
    }
  });

  it("only authority types with a consumer are assignable, and never owner", () => {
    const body = functionBody("passport_assign_authority");
    const assignable = [...(body.match(/p_authority not in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(assignable.sort()).toEqual(["credential_issuer", "data_requester", "evidence_reviewer"]);
    expect(assignable).not.toContain("owner");
    for (const type of assignable) expect(AUTHORITY_TYPES).toContain(type);
  });

  it("the authority check never consults a membership role", () => {
    for (const fn of ["passport_has_authority", "passport_subject_owner_ok", "passport_can_act_as_verifier", "passport_is_claim_reviewer"]) {
      const body = functionBody(fn);
      expect(body, fn).not.toMatch(/organization_members/);
      expect(body, fn).not.toMatch(/has_organization_role|is_organization_member/);
    }
  });
});

describe("SQL <-> contracts parity: consent + relationships", () => {
  it("consent statuses", () => expect(quotedListAfter("status text not null default 'requested' check (status in (", "passport_consent_grants")).toEqual(sorted(CONSENT_STATUSES)));
  it("consent purposes", () => expect(quotedListAfter("purpose text not null check (purpose in (")).toEqual(sorted(CONSENT_PURPOSES)));
  it("data categories", () => expect(quotedListAfter("select p_category in (")).toEqual(sorted(DATA_CATEGORIES)));
  it("relation types", () => expect(quotedListAfter("relation text not null check (relation in (")).toEqual(sorted(RELATION_TYPES)));
  it("relationship statuses", () => expect(quotedListAfter("status text not null default 'pending' check (status in (", "passport_relationships")).toEqual(sorted(RELATIONSHIP_STATUSES)));

  it("consent transitions", () => {
    const pairs = [...functionBody("passport_consent_transition_allowed").matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const expected = Object.entries(CONSENT_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(expected);
  });

  it("relationship transitions", () => {
    const pairs = [...functionBody("passport_relationship_transition_allowed").matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const expected = Object.entries(RELATIONSHIP_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(expected);
  });

  it("purpose -> allowed categories (purpose-bound minimisation)", () => {
    const pairs = [...functionBody("passport_purpose_allows_category").matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const expected = Object.entries(PURPOSE_ALLOWED_CATEGORIES).flatMap(([purpose, categories]) => categories.map((category) => `${purpose}>${category}`)).sort();
    expect(pairs).toEqual(expected);
  });

  it("claim type -> consent category", () => {
    const rules = [...functionBody("passport_claim_category").matchAll(/like '([a-z_]+)\.%' then '([a-z_]+)'/g)];
    expect(rules.length).toBeGreaterThan(3);
    for (const [, prefix, category] of rules) expect(claimCategoryFor(`${prefix}.example`), prefix).toBe(category);
    expect(claimCategoryFor("weird.type")).toBeNull();
  });

  it("relation rules (which relations can be created natively, and between what)", () => {
    const rows = [...functionBody("passport_relation_rule").matchAll(/\('([a-z_]+)', '([a-z]+)', '([a-z]+)', (true|false), (true|false)\)/g)];
    expect(rows.map((r) => r[1]).sort()).toEqual(sorted(RELATION_TYPES));
    for (const [, relation, from, to, available, managed] of rows) {
      expect({ from, to, available: available === "true", managedElsewhere: managed === "true" }, relation).toEqual(RELATION_RULES[relation as keyof typeof RELATION_RULES]);
    }
  });

  it("no Passport policy or function grants anything based on a relationship", () => {
    // Relationships describe; authority acts. Only the relationship RPCs/policies may touch the table.
    for (const fn of ["passport_has_authority", "passport_subject_owner_ok", "passport_can_act_as_verifier", "passport_can_request_as", "passport_disclose", "passport_record_verification"]) {
      expect(functionBody(fn), fn).not.toMatch(/passport_relationships/);
    }
  });
});

describe("SQL <-> contracts parity: capture + integrations", () => {
  const capture = "passport_capture_requests";
  it("capture statuses", () => expect(quotedListAfter("status text not null default 'requested' check (status in (", capture)).toEqual(sorted(CAPTURE_REQUEST_STATUSES)));
  it("capture purposes", () => expect(quotedListAfter("purpose text not null check (purpose in (", capture)).toEqual(sorted(CAPTURE_PURPOSES)));
  it("capture evidence types (what Capture can actually produce)", () => expect(quotedListAfter("evidence_type text not null check (evidence_type in (", capture)).toEqual(sorted(CAPTURE_EVIDENCE_TYPES)));
  it("capture related types", () => expect(quotedListAfter("related_type text check (related_type is null or related_type in (", capture)).toEqual(sorted(CAPTURE_RELATED_TYPES)));
  it("capture data policies", () => {
    expect(quotedListAfter("location_policy text not null default 'forbidden' check (location_policy in (", capture)).toEqual(sorted(DATA_POLICIES));
    expect(quotedListAfter("operator_identity_policy text not null default 'forbidden' check (operator_identity_policy in (", capture)).toEqual(sorted(DATA_POLICIES));
  });
  it("capture consent bases", () => expect(quotedListAfter("consent_basis text not null check (consent_basis in (", capture)).toEqual(sorted(CONSENT_BASES)));
  it("capture failure reasons", () => expect(quotedListAfter("failure_reason text check (failure_reason is null or failure_reason in (", capture)).toEqual(sorted(CAPTURE_FAILURE_REASONS)));

  it("capture transitions", () => {
    const pairs = [...functionBody("passport_capture_transition_allowed").matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const expected = Object.entries(CAPTURE_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(pairs).toEqual(expected);
  });

  it("connection statuses and error categories", () => {
    expect(quotedListAfter("status text not null default 'healthy' check (status in (", "passport_integration_connections")).toEqual(sorted(CONNECTION_STATUSES));
    expect(quotedListAfter("last_error_category text check (last_error_category is null or last_error_category in (", "passport_integration_connections")).toEqual(sorted(CONNECTION_ERROR_CATEGORIES));
  });

  it("every business reason a gateway RPC can return is a public gateway error code", () => {
    for (const fn of ["passport_gateway_get_capture_request", "passport_gateway_report_capture_status", "passport_gateway_ingest_evidence_package", "passport_gateway_get_evidence_summary"]) {
      const reasons = [...functionBody(fn).matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1]);
      expect(reasons.length, fn).toBeGreaterThan(0);
      for (const reason of reasons) expect(Object.keys(GATEWAY_ERRORS), `${fn} -> ${reason}`).toContain(reason);
    }
  });

  it("the wire-shape key lists asserted by the DB suite equal the zod contracts (DB output == list == contract)", () => {
    const dbTest = fs.readFileSync(path.resolve(__dirname, "../db/passport_v2_capture_gateway.test.sql"), "utf8");
    const keysAsserted = (label: string) => {
      const line = dbTest.split("\n").find((l) => l.includes(label));
      expect(line, label).toBeTruthy();
      return [...(line as string).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((k) => !["request", "summary"].includes(k) && !label.includes(k)).sort();
    };
    const request = keysAsserted("the wire shape matches the CaptureRequest contract exactly").filter((k) => k !== "C");
    expect(request.length).toBeGreaterThan(15);
    expect(request).toEqual(Object.keys(CaptureRequest.shape).sort());
    const summary = keysAsserted("summary shape matches the EvidenceSummary contract").filter((k) => k !== "C");
    expect(summary.length).toBeGreaterThan(7);
    expect(summary).toEqual(Object.keys(EvidenceSummary.shape).sort());
  });
});

describe("SQL <-> TS parity: the public claim-value allow-list (M1)", () => {
  // passport_public_claim_value() is the ENFORCEMENT (database); PUBLIC_VALUE_FIELDS is the TypeScript mirror that builds titles.
  // If they ever disagree, one of them is either leaking a field or silently dropping one.
  const fn = sql.slice(sql.indexOf("create or replace function public.passport_public_claim_value"));
  const body = fn.slice(0, fn.indexOf("$$;", fn.indexOf("as $$")));
  const arms = [...body.matchAll(/when '([^']+)' then jsonb_strip_nulls\(jsonb_build_object\(([\s\S]*?)\)\)\s*(?=when|else)/g)];

  it("lists exactly the same claim types and fields, and defaults every other type to nothing", () => {
    const fromSql = Object.fromEntries(arms.map(([, type, args]) => [type, [...args.matchAll(/^\s*'([a-z_]+)',/gm)].map((m) => m[1]).sort()]));
    const fromTs = Object.fromEntries(Object.entries(PUBLIC_VALUE_FIELDS).map(([type, fields]) => [type, [...fields].sort()]));
    expect(arms.length, "the allow-list arms were not parsed").toBeGreaterThan(0);
    expect(fromSql).toEqual(fromTs);
    expect(body).toMatch(/else '\{\}'::jsonb/);
  });
});

describe("every SQL reason code has a member-facing message", () => {
  const reasons = [...new Set([...sql.matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1]))].sort();

  it("finds the reason codes", () => expect(reasons.length).toBeGreaterThan(30));

  for (const reason of reasons) {
    it(reason, () => expect(passportReasonMessage(reason), `no message for "${reason}"`).not.toBe("Unable to complete that."));
  }

  it("falls back safely for unknown codes", () => expect(passportReasonMessage("nonsense")).toBe("Unable to complete that."));
});

describe("migration hygiene", () => {
  it("every Passport V2 table enables RLS and revokes default client grants", () => {
    const tables = [...sql.matchAll(/create table public\.(passport_[a-z_]+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThan(5);
    for (const table of tables) {
      expect(sql, `${table} must enable RLS`).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
      expect(sql, `${table} must revoke default grants`).toMatch(new RegExp(`revoke all on table[^;]*public\\.${table}[^;]*from public, anon, authenticated`));
    }
  });

  it("no client role ever receives INSERT/UPDATE/DELETE on a Passport V2 table", () => {
    for (const grant of sql.matchAll(/grant ([^;]+?) on table ([^;]+?) to ([^;]+);/g)) {
      const [, privileges, , roles] = grant;
      if (/service_role/.test(roles) && !/anon|authenticated/.test(roles)) continue;
      expect(privileges, `grant to ${roles}`).not.toMatch(/insert|update|delete|truncate|all/i);
    }
  });

  it("every SECURITY DEFINER function pins its search_path", () => {
    for (const fn of sql.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\$\$;/g)) {
      const text = fn[0];
      if (/security definer/i.test(text)) expect(text, fn[1]).toMatch(/set search_path to 'pg_catalog'/);
    }
  });

  it("every non-pure function revokes default execute (pure immutable helpers and trigger functions are exempt)", () => {
    for (const match of sql.matchAll(/create or replace function public\.([a-z_]+)\([\s\S]*?\$\$;/g)) {
      const [text, fn] = match;
      const pure = /\bimmutable\b/.test(text) && !/security definer/i.test(text);
      // Trigger functions can only run as triggers; EXECUTE grants are moot for them.
      const trigger = /returns trigger/i.test(text);
      if (pure || trigger) continue;
      expect(sql, `${fn} must revoke default execute`).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`));
    }
  });
});
