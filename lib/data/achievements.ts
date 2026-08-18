import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export type AchievementDef = Tables<"achievements">;
export type EarnedAchievement = Tables<"profile_achievements"> & { achievement: AchievementDef };

export async function getAllAchievements(): Promise<AchievementDef[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("achievements").select("*").order("points_bonus", { ascending: true });
  return data ?? [];
}

export async function getEarnedAchievements(profileId: string): Promise<EarnedAchievement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile_achievements")
    .select("*, achievement:achievements(*)")
    .eq("profile_id", profileId)
    .order("earned_at", { ascending: false });

  return (data ?? []) as EarnedAchievement[];
}
