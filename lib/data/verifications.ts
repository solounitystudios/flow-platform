import { createClient } from "@/lib/supabase/server";
import { canSubmitApplicationEvidence } from "@/lib/authz";
import type { Tables } from "@/lib/database.types";

export type CredentialType = Tables<"credential_types">;
export type Verification = Tables<"verifications">;
export type ProfileCredential = Tables<"profile_credentials">;

export async function getCredentialTypes(): Promise<CredentialType[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("credential_types").select("*").order("sort_order");
  return data ?? [];
}

/** The member's own evidence claims — every column here is already
 * member-appropriate (no verifier identity, method, or reasoning; that
 * lives in verification_reviews, which only admins can read). */
export async function getMyVerifications(profileId: string): Promise<Verification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyVerifications] query failed:", error.message);
    throw new Error("Unable to load your evidence.");
  }
  return data ?? [];
}

/** The colored credential badges a profile has earned — public, same
 * visibility precedent as profile_skills/achievements in this codebase. */
export async function getProfileCredentials(profileId: string): Promise<ProfileCredential[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_credentials")
    .select("*")
    .eq("profile_id", profileId)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false });
  return data ?? [];
}

/** Narrow lookup used when a claimant names a collaborator by username on
 * the evidence submission form. Deliberately returns only what's needed to
 * resolve a username to a profile id — no passport/reliability data. */
export async function findProfileByUsername(username: string): Promise<Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, username").eq("username", username).maybeSingle();
  return data ?? null;
}

/** Narrow lookup used to populate the "related creative project" picker on
 * the evidence submission form. Reads creative_project_members (Batch 15's
 * Creative Projects foundation — no owning specialist assigned yet) filtered
 * to the caller's own currently-active memberships, joined to just the id +
 * title of each project. This is not a claim of ownership over that table or
 * feature — it returns exactly the two fields the picker needs and nothing
 * else (no role, no status, no other members). */
export interface MyCreativeProject {
  id: string;
  title: string;
}

/** A claim references at most one of skill_id / creative_project_id /
 * application_id. creative_project_id wins if more than one is somehow
 * submitted, then skill_id, then application_id — in practice these are
 * mutually exclusive (the application-linked entry point from WorkCard.tsx
 * hides the skill/creative-project pickers entirely), but the priority order
 * is kept deterministic and tested regardless. Pure and exported so the
 * priority rule has a direct regression test independent of
 * submitEvidenceAction's surrounding Supabase/auth plumbing. */
export function resolveEvidenceReference(
  skillId: string,
  creativeProjectId: string,
  applicationId: string
): { reference_table: "creative_project" | "profile_skill" | "application" | null; reference_id: string | null } {
  const reference_table = creativeProjectId ? "creative_project" : skillId ? "profile_skill" : applicationId ? "application" : null;
  const reference_id = creativeProjectId || skillId || applicationId || null;
  return { reference_table, reference_id };
}

export async function getMyActiveCreativeProjects(profileId: string): Promise<MyCreativeProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creative_project_members")
    .select("project:creative_projects(id, title)")
    .eq("profile_id", profileId)
    .eq("status", "active");

  if (error) {
    console.error("[getMyActiveCreativeProjects] query failed:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => row.project as unknown as MyCreativeProject | null)
    .filter((project): project is MyCreativeProject => project !== null);
}

export interface ApplicationEvidenceContext {
  application_id: string;
  opportunity_title: string;
  organization_name: string | null;
  confirmer_id: string;
  confirmer_name: string | null;
  eligible: boolean;
}

/** Server-derived context for the "submit evidence for this completed gig"
 * deep link from WorkCard.tsx, and the single source submitEvidenceAction
 * uses to derive witness_profile_id server-side — the query string/form
 * only ever supplies which application_id to look up, never who confirms it
 * or what it's titled. `eligible` mirrors canSubmitApplicationEvidence
 * exactly (lib/authz.ts) — the same predicate submitEvidenceAction
 * re-checks before inserting. This is a display/derivation convenience, not
 * the authorization boundary itself; is_application_participant() at the DB
 * layer (verifications_self_insert's WITH CHECK) is what actually enforces
 * it. Returns null if applicationId doesn't resolve to a readable
 * application+opportunity at all — RLS (applications_parties_read) scopes
 * that read to just the applicant or the opportunity's creator, same as
 * everywhere else in this codebase. */
export async function getApplicationEvidenceContext(applicationId: string, viewerId: string): Promise<ApplicationEvidenceContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id, applicant_id, status, opportunity:opportunities(title, created_by, organization:organizations(name), creator:profiles!opportunities_created_by_fkey(full_name, username))"
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("[getApplicationEvidenceContext] query failed:", error.message);
    return null;
  }
  if (!data || !data.opportunity) return null;
  const opp = data.opportunity as unknown as {
    title: string;
    created_by: string;
    organization: { name: string } | null;
    creator: { full_name: string | null; username: string | null } | null;
  };

  return {
    application_id: data.id,
    opportunity_title: opp.title,
    organization_name: opp.organization?.name ?? null,
    confirmer_id: opp.created_by,
    confirmer_name: opp.creator?.full_name || opp.creator?.username || null,
    eligible: canSubmitApplicationEvidence({ applicant_id: data.applicant_id, status: data.status }, viewerId),
  };
}

/** A single claim, with the claimant's public profile joined in. RLS
 * (verifications_self_read) only lets the claimant or an admin read this —
 * a named witness who isn't the claimant will get `null` here even for a
 * claim they're entitled to *confirm* via the RPC (row-scoped auth on the
 * write path is independent of read access). The confirm page falls back to
 * link-provided display context in that case; see
 * app/(app)/passport/confirm/[id]/page.tsx for the full explanation. */
export interface VerificationDetail extends Verification {
  profile: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
}

export async function getVerificationById(id: string): Promise<VerificationDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verifications")
    .select("*, profile:profiles!verifications_profile_id_fkey(id, full_name, username)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[getVerificationById] query failed:", error.message);
    return null;
  }
  return (data as unknown as VerificationDetail) ?? null;
}

// ── Admin: evidence review queue ─────────────────────────────────────────

export interface EvidenceQueueRow extends Verification {
  profile: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
  witness: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null;
  organization: Pick<Tables<"organizations">, "id" | "name"> | null;
}

export async function getEvidenceQueue(status?: string): Promise<EvidenceQueueRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("verifications")
    .select("*, profile:profiles!verifications_profile_id_fkey(id, full_name, username), witness:profiles!verifications_witness_profile_id_fkey(id, full_name, username), organization:organizations(id, name)")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  else query = query.eq("status", "pending");

  const { data, error } = await query;
  if (error) {
    console.error("[getEvidenceQueue] query failed:", error.message);
    throw new Error("Unable to load the evidence queue.");
  }
  return (data ?? []) as unknown as EvidenceQueueRow[];
}

export type VerificationReviewRow = Tables<"verification_reviews"> & { actor: Pick<Tables<"profiles">, "id" | "full_name" | "username"> | null };

export async function getVerificationReviews(verificationId: string): Promise<VerificationReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("verification_reviews")
    .select("*, actor:profiles(id, full_name, username)")
    .eq("verification_id", verificationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getVerificationReviews] query failed:", error.message);
    throw new Error("Unable to load the review history.");
  }
  return (data ?? []) as unknown as VerificationReviewRow[];
}
