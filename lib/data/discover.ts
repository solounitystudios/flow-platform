import { createClient } from "@/lib/supabase/server";
import { mockPeople, mockOrganizations } from "@/lib/mock/data";
import { dicebearAvatar } from "@/lib/utils";
import type { MockOrganization, MockPerson } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

type DiscoverPerson = Pick<MockPerson, "id" | "username" | "full_name" | "avatar_url" | "city" | "state" | "bio" | "reliability_score" | "available_now">;

function toPersonCard(row: Tables<"profiles">): DiscoverPerson {
  return {
    id: row.id,
    username: row.username ?? row.id.slice(0, 8),
    full_name: row.full_name ?? "FLOW Member",
    avatar_url: row.avatar_url ?? dicebearAvatar(row.username ?? row.id),
    city: row.city,
    state: row.state,
    bio: row.bio ?? "",
    reliability_score: row.reliability_score,
    available_now: row.available_now,
  };
}

/** Real members with a public passport and a claimed username, supplemented with
 * demo profiles so discovery never looks empty before the platform has real supply. */
export async function getDiscoverPeople(excludeId?: string): Promise<DiscoverPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("public_passport", true)
    .not("username", "is", null)
    .order("reliability_score", { ascending: false });

  const real = (data ?? []).filter((p) => p.id !== excludeId).map(toPersonCard);
  return [...real, ...mockPeople];
}

function toOrgCard(row: Tables<"organizations">): MockOrganization {
  return {
    id: row.id,
    name: row.name,
    logo_url: dicebearAvatar(row.name),
    city: row.city ?? "Buffalo",
    state: row.state ?? "NY",
    description: row.description ?? "",
    verified: row.verified,
    industry: row.org_type ? row.org_type.charAt(0).toUpperCase() + row.org_type.slice(1) : "Business",
    member_perk: null,
    rating: null,
  };
}

export async function getDiscoverOrganizations(): Promise<MockOrganization[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("*").order("created_at", { ascending: false });

  const real = (data ?? []).map(toOrgCard);
  return [...real, ...mockOrganizations];
}
