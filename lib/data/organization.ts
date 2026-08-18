import { createClient } from "@/lib/supabase/server";

export async function getOrganizationByOwner(ownerId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").eq("owner_id", ownerId).maybeSingle();
  return data;
}
