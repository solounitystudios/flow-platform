import { createClient } from "@/lib/supabase/server";

export async function getReliabilityBreakdown(profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("reliability_breakdown").select("*").eq("profile_id", profileId).maybeSingle();
  return data;
}
