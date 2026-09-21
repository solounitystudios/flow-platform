import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ClaimExplanation } from "@flow/passport-contracts";
import type { Database } from "@/lib/database.types";
import type { ClaimRowInput, PublicClaimRow } from "@/lib/passport/domain";

type Client = SupabaseClient<Database>;

const CLAIM_COLUMNS = "id, claim_type, value, status, effective_at, expires_at, visibility, sensitivity, source_system, created_at";

function toRow(row: Database["public"]["Tables"]["passport_claims"]["Row"]): ClaimRowInput {
  return {
    id: row.id,
    claim_type: row.claim_type,
    value: (row.value && typeof row.value === "object" && !Array.isArray(row.value) ? row.value : {}) as Record<string, unknown>,
    status: row.status as ClaimRowInput["status"],
    effective_at: row.effective_at,
    expires_at: row.expires_at,
    visibility: row.visibility as ClaimRowInput["visibility"],
    sensitivity: row.sensitivity as ClaimRowInput["sensitivity"],
    source_system: row.source_system,
    created_at: row.created_at,
  };
}

/**
 * The person's own canonical claims. RLS returns only claims the caller owns (or was asked to review); the subject
 * filter is explicit anyway. Newest first. This is the OWNER representation — full rows, read from the canonical
 * table. Public data never comes from here (see getPublicClaimsForProfile).
 */
export async function getMyClaims(supabase: Client, profileId: string): Promise<ClaimRowInput[]> {
  const { data, error } = await supabase
    .from("passport_claims")
    .select(CLAIM_COLUMNS)
    .eq("subject_type", "person")
    .eq("subject_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[getMyClaims]", error.message);
    return [];
  }
  return (data ?? []).map((row) => toRow(row as Database["public"]["Tables"]["passport_claims"]["Row"]));
}

/**
 * The wire shape of passport_public_claims(). `.strip()` (zod's default for objects) drops anything the database
 * might one day over-return, so an extra column can never reach a component; a row that doesn't match at all makes
 * the whole result empty (fail closed) rather than half-trusted.
 */
const PublicClaimRowSchema = z.object({
  id: z.string().uuid(),
  claim_type: z.string().min(1),
  effective_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  public_value: z.record(z.string(), z.unknown()).nullable(),
});

async function callPublicClaims(supabase: Client, args: { p_profile_id?: string; p_claim_id?: string; p_limit: number }): Promise<PublicClaimRow[]> {
  const { data, error } = await supabase.rpc("passport_public_claims", args);
  if (error) {
    // The fact, not the message body: it can carry schema detail.
    console.error("[passport_public_claims] query failed");
    return [];
  }
  const parsed = z.array(PublicClaimRowSchema).safeParse(data ?? []);
  if (!parsed.success) {
    console.error("[passport_public_claims] response violated the contract");
    return [];
  }
  return parsed.data;
}

/**
 * Claims a stranger may see on someone's public Passport, from the ONLY public read path: the allow-listed
 * passport_public_claims() projection. The raw passport_claims table is not readable by the public (RLS is
 * row-level; it cannot hide source_ref, issuer_id, created_by or the raw value).
 */
export const getPublicClaimsForProfile = (supabase: Client, profileId: string) => callPublicClaims(supabase, { p_profile_id: profileId, p_limit: 20 });

/** One public claim by id (for its explanation page), or null when it isn't publicly visible — same answer as "doesn't exist". */
export async function getPublicClaimById(supabase: Client, claimId: string, profileId?: string): Promise<PublicClaimRow | null> {
  return (await callPublicClaims(supabase, { p_claim_id: claimId, p_profile_id: profileId, p_limit: 1 }))[0] ?? null;
}

/**
 * "Why does Passport show this?" — the viewer-scoped explanation. The
 * database decides what this viewer may learn; the response is re-validated
 * against the contract so a shape drift fails closed (null) instead of
 * rendering something unexpected.
 */
export async function getClaimExplanation(supabase: Client, claimId: string): Promise<ClaimExplanation | null> {
  const { data, error } = await supabase.rpc("passport_claim_explanation", { p_claim_id: claimId });
  if (error) {
    console.error("[getClaimExplanation]", error.message);
    return null;
  }
  const raw = data as { ok?: boolean } | null;
  if (!raw || raw.ok !== true) return null;
  const parsed = ClaimExplanation.safeParse(raw);
  if (!parsed.success) {
    console.error("[getClaimExplanation] response violated the contract");
    return null;
  }
  return parsed.data;
}

/**
 * One claim row as RLS lets THIS viewer read it: the owner (or an asked reviewer / admin) gets the canonical row;
 * everyone else gets null. Used only to title the owner's explanation page; what a viewer may be told about a
 * claim's provenance comes from the explanation RPC, and a stranger's title from getPublicClaimById.
 */
export async function getClaimRow(supabase: Client, claimId: string): Promise<ClaimRowInput | null> {
  const { data } = await supabase.from("passport_claims").select(CLAIM_COLUMNS).eq("id", claimId).maybeSingle();
  return data ? toRow(data as Database["public"]["Tables"]["passport_claims"]["Row"]) : null;
}

/** Resolve a public username to a profile id (usernames are already public identifiers). */
export async function getProfileIdByUsername(supabase: Client, username: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  return data?.id ?? null;
}

/** The claim (if any) the caller already created from this activity, so the UI can show "On your Passport". */
export async function getMyClaimIdForActivity(supabase: Client, profileId: string, activityId: string): Promise<string | null> {
  const { data } = await supabase
    .from("passport_claims")
    .select("id")
    .eq("subject_type", "person")
    .eq("subject_id", profileId)
    .eq("claim_type", "participation.activity")
    .eq("value->>activity_id", activityId)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
