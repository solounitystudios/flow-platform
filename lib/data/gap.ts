import { createClient } from "@/lib/supabase/server";

export interface OpportunityGap {
  matched: { id: string; name: string }[];
  missing: { id: string; name: string }[];
}

/** Explains which required skills a member already has on their Passport
 * vs. which ones are missing for a given opportunity — real data only,
 * never a guess or a promise of an outcome. */
export async function getOpportunityGap(opportunityId: string, profileId: string): Promise<OpportunityGap | null> {
  const supabase = await createClient();

  const { data: requirements } = await supabase
    .from("opportunity_skill_requirements")
    .select("skill_id, required, skill:skills(id, name)")
    .eq("opportunity_id", opportunityId)
    .eq("required", true);

  if (!requirements || requirements.length === 0) return null;

  const { data: mySkills } = await supabase.from("profile_skills").select("skill_id").eq("profile_id", profileId);
  const mySkillIds = new Set((mySkills ?? []).map((s) => s.skill_id));

  const matched: OpportunityGap["matched"] = [];
  const missing: OpportunityGap["missing"] = [];
  for (const r of requirements) {
    const skill = r.skill as unknown as { id: string; name: string } | null;
    if (!skill) continue;
    if (mySkillIds.has(r.skill_id)) matched.push(skill);
    else missing.push(skill);
  }

  return { matched, missing };
}
