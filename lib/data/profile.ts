import { createClient } from "@/lib/supabase/server";
import type { PassportSummary, Tables } from "@/lib/database.types";

export interface FullProfile {
  profile: Tables<"profiles">;
  passport: PassportSummary;
  skills: (Tables<"profile_skills"> & { skill: Tables<"skills"> })[];
  recommendations: (Tables<"recommendations"> & { author: Tables<"profiles"> })[];
}

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getFullProfile(profileId: string): Promise<FullProfile | null> {
  const supabase = await createClient();

  const [{ data: profile }, { data: passport }, { data: skills }, { data: recommendations }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("passport_summary").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("profile_skills").select("*, skill:skills(*)").eq("profile_id", profileId),
    supabase
      .from("recommendations")
      .select("*, author:profiles!recommendations_author_id_fkey(*)")
      .eq("recipient_id", profileId)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) return null;

  return {
    profile,
    passport: passport ?? {
      id: profile.id,
      full_name: profile.full_name,
      username: profile.username,
      city: profile.city,
      state: profile.state,
      available_now: profile.available_now,
      reliability_score: profile.reliability_score,
      flow_points: profile.flow_points,
      gigs_completed: 0,
      skills_verified: 0,
      events_attended: 0,
      recommendations: 0,
      earned_cents: 0,
    },
    skills: (skills ?? []) as FullProfile["skills"],
    recommendations: (recommendations ?? []) as FullProfile["recommendations"],
  };
}

export async function getFullProfileByUsername(username: string): Promise<FullProfile | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile) return null;
  return getFullProfile(profile.id);
}

export async function getAllSkills() {
  const supabase = await createClient();
  const { data } = await supabase.from("skills").select("*").order("category").order("name");
  return data ?? [];
}
