import { createClient } from "@/lib/supabase/server";
import { mockOpportunities } from "@/lib/mock/data";
import { milesFromCityCenter, isUuid } from "@/lib/geo";
import { dicebearAvatar } from "@/lib/utils";
import type { MockOpportunity } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

type RealOpportunityRow = Tables<"opportunities"> & {
  organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null;
};

function toCardShape(row: RealOpportunityRow, slotsFilled: number): MockOpportunity {
  const orgName = row.organization?.name ?? "FLOW Business";
  return {
    id: row.id,
    organization: {
      id: row.organization?.id ?? row.created_by,
      name: orgName,
      logo_url: dicebearAvatar(orgName),
      verified: row.organization?.verified ?? false,
    },
    title: row.title,
    description: row.description ?? "",
    opportunity_type: row.opportunity_type as MockOpportunity["opportunity_type"],
    status: row.status as MockOpportunity["status"],
    city: row.city,
    state: row.state,
    location_name: row.is_remote ? "Remote" : row.location_name ?? row.city,
    lat: row.lat ?? 42.8864,
    lng: row.lng ?? -78.8784,
    starts_at: row.starts_at ?? row.created_at,
    ends_at: row.ends_at,
    pay_cents: row.pay_cents,
    slots: row.slots,
    slots_filled: slotsFilled,
    category: row.category,
    is_remote: row.is_remote,
    distance_mi: row.is_remote ? 0 : milesFromCityCenter(row.lat, row.lng),
    urgent: !row.is_remote && !!row.starts_at && new Date(row.starts_at).getTime() - Date.now() < 6 * 60 * 60 * 1000,
  };
}

/** Real, Supabase-backed open opportunities, supplemented with demo content so
 * discovery never looks empty before the platform has real multi-city supply. */
export async function getOpenOpportunities(): Promise<MockOpportunity[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("opportunities")
    .select("*, organization:organizations(id, name, verified)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  const real = rows ?? [];
  let filledCounts = new Map<string, number>();

  if (real.length > 0) {
    const { data: apps } = await supabase
      .from("applications")
      .select("opportunity_id, status")
      .in(
        "opportunity_id",
        real.map((o) => o.id),
      )
      .in("status", ["accepted", "completed"]);
    filledCounts = new Map();
    for (const a of apps ?? []) {
      filledCounts.set(a.opportunity_id, (filledCounts.get(a.opportunity_id) ?? 0) + 1);
    }
  }

  const realShaped = real.map((o) => toCardShape(o as RealOpportunityRow, filledCounts.get(o.id) ?? 0));
  return [...realShaped, ...mockOpportunities.filter((o) => o.status === "open")];
}

export interface OpportunityDetail extends MockOpportunity {
  source: "real" | "mock";
  isOwner: boolean;
  instantBook: boolean;
  myApplicationStatus: string | null;
  myApplicationId: string | null;
}

export async function getOpportunityDetail(id: string, viewerId: string | null): Promise<OpportunityDetail | null> {
  if (!isUuid(id)) {
    const mock = mockOpportunities.find((o) => o.id === id);
    if (!mock) return null;
    return { ...mock, source: "mock", isOwner: false, instantBook: false, myApplicationStatus: null, myApplicationId: null };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("opportunities")
    .select("*, organization:organizations(id, name, verified)")
    .eq("id", id)
    .maybeSingle();

  if (!row) return null;

  const { data: apps } = await supabase
    .from("applications")
    .select("id, applicant_id, status")
    .eq("opportunity_id", id)
    .in("status", ["accepted", "completed"]);

  const mine = viewerId ? await supabase.from("applications").select("id, status").eq("opportunity_id", id).eq("applicant_id", viewerId).maybeSingle() : null;

  const shaped = toCardShape(row as RealOpportunityRow, (apps ?? []).length);

  return {
    ...shaped,
    source: "real",
    isOwner: viewerId === row.created_by,
    instantBook: row.instant_book,
    myApplicationStatus: mine?.data?.status ?? null,
    myApplicationId: mine?.data?.id ?? null,
  };
}

export async function getOpportunitiesByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("*").eq("created_by", creatorId).order("created_at", { ascending: false });
  return data ?? [];
}
