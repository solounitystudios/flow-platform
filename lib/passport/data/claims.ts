import type { SupabaseClient } from "@supabase/supabase-js";
import { ClaimExplanation } from "@flow/passport-contracts";
import type { Database } from "@/lib/database.types";
import type { ClaimRowInput } from "@/lib/passport/domain";

type Client = SupabaseClient<Database>;

const CLAIM_COLUMNS = "id, claim_type, value, status, effective_at, expires_at, visibility, sensitivity, created_at";

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
    created_at: row.created_at,
  };
}

/**
 * The person's own canonical claims. RLS returns the owner's claims (and
 * would also return other people's PUBLIC claims), so the subject filter is
 * explicit. Newest first.
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
 * Claims a stranger may see on someone's public Passport. RLS already limits
 * this to public + verified + unexpired claims of a public passport; the
 * filters here just make the intent explicit and cheap. The caller still
 * projects each row through projectClaimForPublic.
 */
export async function getPublicClaimsForProfile(supabase: Client, profileId: string): Promise<ClaimRowInput[]> {
  const { data, error } = await supabase
    .from("passport_claims")
    .select(CLAIM_COLUMNS)
    .eq("subject_type", "person")
    .eq("subject_id", profileId)
    .eq("visibility", "public")
    .eq("status", "verified")
    .order("effective_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) {
    console.error("[getPublicClaimsForProfile]", error.message);
    return [];
  }
  return (data ?? []).map((row) => toRow(row as Database["public"]["Tables"]["passport_claims"]["Row"]));
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
 * One claim row, as RLS lets THIS viewer read it (null when they can't). Used
 * only to title the explanation page; what the viewer may be told about the
 * claim's provenance still comes from the explanation RPC.
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
