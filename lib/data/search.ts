import { createClient } from "@/lib/supabase/server";
import { dicebearAvatar } from "@/lib/utils";
import type { Tables } from "@/lib/database.types";

export interface MemberSearchResult {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string;
  city: string;
  state: string;
  intent_types: string[];
}

export interface OpportunitySearchResult extends Pick<Tables<"opportunities">, "id" | "title" | "opportunity_type" | "city" | "state" | "is_remote" | "category"> {}

export interface SkillSearchResult extends Pick<Tables<"skills">, "id" | "name" | "category"> {}

export interface IntentSearchFilters {
  q?: string;
  intentType?: string;
  category?: string;
}

/** Members whose active, visible intent matches — RLS
 * (member_intents_public_read + profiles_block_restrict) already excludes
 * expired/hidden intent and blocked profiles, so this never has to
 * re-implement either rule. */
export async function searchMembers(filters: IntentSearchFilters): Promise<MemberSearchResult[]> {
  const supabase = await createClient();
  let query = supabase
    .from("member_intents")
    .select("profile_id, intent_type, target_categories, profile:profiles(id, username, full_name, city, state)")
    .limit(100);

  if (filters.intentType) query = query.eq("intent_type", filters.intentType);
  if (filters.category) query = query.contains("target_categories", [filters.category]);

  const { data, error } = await query;
  if (error) {
    console.error("[searchMembers] query failed:", error.message);
    return [];
  }

  const byProfile = new Map<string, MemberSearchResult>();
  for (const row of data ?? []) {
    const p = row.profile as unknown as Tables<"profiles"> | null;
    if (!p) continue;
    if (filters.q && !(p.full_name ?? "").toLowerCase().includes(filters.q.toLowerCase()) && !(p.username ?? "").toLowerCase().includes(filters.q.toLowerCase())) continue;
    const existing = byProfile.get(p.id);
    if (existing) existing.intent_types.push(row.intent_type);
    else
      byProfile.set(p.id, {
        id: p.id,
        username: p.username,
        full_name: p.full_name,
        avatar_url: dicebearAvatar(p.username ?? p.id),
        city: p.city,
        state: p.state,
        intent_types: [row.intent_type],
      });
  }
  return Array.from(byProfile.values());
}

export async function searchOpportunities(filters: IntentSearchFilters): Promise<OpportunitySearchResult[]> {
  const supabase = await createClient();
  let query = supabase
    .from("opportunities")
    .select("id, title, opportunity_type, city, state, is_remote, category")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  if (filters.q) query = query.ilike("title", `%${filters.q}%`);
  if (filters.category) query = query.eq("category", filters.category);

  const { data, error } = await query;
  if (error) {
    console.error("[searchOpportunities] query failed:", error.message);
    return [];
  }
  return data ?? [];
}

export async function searchSkills(filters: IntentSearchFilters): Promise<SkillSearchResult[]> {
  const supabase = await createClient();
  let query = supabase.from("skills").select("id, name, category").order("name").limit(50);
  if (filters.q) query = query.ilike("name", `%${filters.q}%`);
  const { data, error } = await query;
  if (error) {
    console.error("[searchSkills] query failed:", error.message);
    return [];
  }
  return data ?? [];
}
