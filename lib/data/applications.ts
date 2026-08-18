import { createClient } from "@/lib/supabase/server";
import type { PassportSummary, Tables } from "@/lib/database.types";

export type ApplicantRow = Tables<"applications"> & {
  applicant: Tables<"profiles">;
  passport: PassportSummary | null;
};

export async function getApplicantsForOpportunity(opportunityId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("*, applicant:profiles!applications_applicant_id_fkey(*)")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as (Tables<"applications"> & { applicant: Tables<"profiles"> })[];
  if (rows.length === 0) return [] as ApplicantRow[];

  const { data: passports } = await supabase
    .from("passport_summary")
    .select("*")
    .in(
      "id",
      rows.map((r) => r.applicant_id),
    );
  const byId = new Map((passports ?? []).map((p) => [p.id, p]));

  return rows.map((r) => ({ ...r, passport: byId.get(r.applicant_id) ?? null }));
}

export type MyApplicationRow = Tables<"applications"> & {
  opportunity: Tables<"opportunities"> & { organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null };
};

export async function getMyApplications(applicantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("*, opportunity:opportunities(*, organization:organizations(id, name, verified))")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false });

  return (data ?? []) as MyApplicationRow[];
}

export async function getMyWork(applicantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("*, opportunity:opportunities(*, organization:organizations(id, name, verified))")
    .eq("applicant_id", applicantId)
    .in("status", ["accepted", "completed", "no_show", "cancelled"])
    .order("created_at", { ascending: false });

  return (data ?? []) as MyApplicationRow[];
}

export async function getApplicationForRecommendation(opportunityId: string, recipientId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("applications")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("applicant_id", recipientId)
    .eq("status", "completed")
    .maybeSingle();
  return data;
}

export async function getRecommendationForHire(opportunityId: string, recipientId: string, authorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recommendations")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .eq("recipient_id", recipientId)
    .eq("author_id", authorId)
    .maybeSingle();
  return data;
}

export async function getApplicantCounts(opportunityIds: string[]) {
  if (opportunityIds.length === 0) return new Map<string, number>();
  const supabase = await createClient();
  const { data } = await supabase.from("applications").select("opportunity_id").in("opportunity_id", opportunityIds);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.opportunity_id, (counts.get(row.opportunity_id) ?? 0) + 1);
  }
  return counts;
}

export async function getRecommendedRecipientIds(opportunityId: string, authorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("recommendations").select("recipient_id").eq("opportunity_id", opportunityId).eq("author_id", authorId);
  return new Set((data ?? []).map((r) => r.recipient_id));
}
