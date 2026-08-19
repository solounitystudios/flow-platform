import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";

export { INTENT_TYPES } from "@/lib/intent-constants";

export type MemberIntent = Tables<"member_intents">;

export async function getMyIntents(profileId: string): Promise<MemberIntent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_intents")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getMyIntents] query failed:", error.message);
    throw new Error("Unable to load your goals.");
  }
  return data ?? [];
}

export async function getActiveIntentCount(profileId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("member_intents")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("active", true);
  return count ?? 0;
}
