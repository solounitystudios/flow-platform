import { createClient } from "@/lib/supabase/server";
import { REWARDS_CATALOG } from "@/lib/mock/data";
import { isDemoModeEnabled } from "@/lib/demo";
import type { Tables } from "@/lib/database.types";

export interface RewardItem {
  id: string;
  title: string;
  partner: string;
  points_required: number;
  description: string | null;
  inventory: number | null;
  redeemed_count: number;
  source: "real" | "mock";
}

/** Real, Supabase-backed active rewards. When NEXT_PUBLIC_FLOW_DEMO_MODE is
 * enabled, supplemented with demo content so the catalog never looks empty
 * before partners have listed real perks — off (the default) returns real
 * rewards only. */
export async function getRewardsCatalog(): Promise<RewardItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("rewards").select("*").eq("status", "active").order("points_required", { ascending: true });

  const real: RewardItem[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    partner: r.partner,
    points_required: r.points_required,
    description: r.description,
    inventory: r.inventory,
    redeemed_count: r.redeemed_count,
    source: "real",
  }));
  if (!isDemoModeEnabled()) return real;
  const mock: RewardItem[] = REWARDS_CATALOG.map((r) => ({
    id: r.id,
    title: r.name,
    partner: r.partner,
    points_required: r.cost_points,
    description: null,
    inventory: null,
    redeemed_count: 0,
    source: "mock",
  }));

  return [...real, ...mock];
}

export async function getLedgerHistory(profileId: string, limit = 25) {
  const supabase = await createClient();
  const { data } = await supabase.from("flow_ledger").select("*").eq("profile_id", profileId).order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export type RedemptionRow = Tables<"reward_redemptions"> & { reward: Tables<"rewards"> };

export async function getMyRedemptions(profileId: string): Promise<RedemptionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reward_redemptions")
    .select("*, reward:rewards(*)")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });

  return (data ?? []) as RedemptionRow[];
}
