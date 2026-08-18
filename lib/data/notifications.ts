import { createClient } from "@/lib/supabase/server";

export async function getNotifications(profileId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(50);
  return data ?? [];
}

export async function getUnreadNotificationCount(profileId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("profile_id", profileId).eq("read", false);
  return count ?? 0;
}
