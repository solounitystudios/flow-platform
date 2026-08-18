import { createClient } from "@/lib/supabase/server";

export async function getOpportunitiesByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("*").eq("created_by", creatorId).order("created_at", { ascending: false });
  return data ?? [];
}

export async function getEventsByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("created_by", creatorId).order("created_at", { ascending: false });
  return data ?? [];
}
