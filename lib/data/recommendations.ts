import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type MatchRecommendation = Tables<"match_recommendations"> & {
  target_profile: Pick<Tables<"profiles">, "id" | "username" | "full_name" | "avatar_url" | "city" | "state"> | null;
  target_opportunity: Pick<Tables<"opportunities">, "id" | "title" | "opportunity_type" | "city" | "state" | "is_remote"> | null;
  target_skill: Pick<Tables<"skills">, "id" | "name"> | null;
};

/** Active (not dismissed, not expired) recommendations for the current
 * member, grouped by type for the explainable feed sections. Every row
 * already carries its own reasons/score/expiration — this never
 * recomputes anything, it only reads what generate_match_recommendations()
 * already persisted. */
export async function getMatchRecommendations(profileId: string): Promise<Record<string, MatchRecommendation[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_recommendations")
    .select(
      "*, target_profile:profiles!match_recommendations_target_profile_id_fkey(id, username, full_name, avatar_url, city, state), target_opportunity:opportunities(id, title, opportunity_type, city, state, is_remote), target_skill:skills(id, name)",
    )
    .eq("profile_id", profileId)
    .is("dismissed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("score", { ascending: false });

  if (error) {
    console.error("[getMatchRecommendations] query failed:", error.message);
    throw new Error("Unable to load recommendations.");
  }

  const grouped: Record<string, MatchRecommendation[]> = { opportunity: [], mentor: [], community: [], reconnection: [], skill_training: [] };
  for (const row of (data ?? []) as unknown as MatchRecommendation[]) {
    (grouped[row.recommendation_type] ??= []).push(row);
  }
  return grouped;
}

export async function hasAnyRecommendations(profileId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("match_recommendations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .is("dismissed_at", null)
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}
