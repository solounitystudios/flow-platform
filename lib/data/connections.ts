import { createClient } from "@/lib/supabase/server";
import { getRealDiscoverPeople, type DiscoverPerson } from "@/lib/data/discover";
import { dicebearAvatar } from "@/lib/utils";
import type { ConnectionStatus, Tables } from "@/lib/database.types";

export interface ConnectionEntry {
  id: string;
  status: ConnectionStatus;
  direction: "incoming" | "outgoing";
  created_at: string;
  person: DiscoverPerson;
  mutuals: number;
}

const PERSON_COLUMNS = "id, username, full_name, avatar_url, city, state, reliability_score, available_now, bio";

function toDiscoverPerson(row: Tables<"profiles">): DiscoverPerson {
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

async function getMutualCounts(profileId: string, targetIds: string[]) {
  const counts = new Map<string, number>();
  if (targetIds.length === 0) return counts;
  const supabase = await createClient();

  const { data: mine } = await supabase
    .from("connections")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`);
  const myConnected = new Set((mine ?? []).map((r) => (r.requester_id === profileId ? r.recipient_id : r.requester_id)));

  const idList = targetIds.join(",");
  const { data: theirs } = await supabase
    .from("connections")
    .select("requester_id, recipient_id")
    .eq("status", "accepted")
    .or(`requester_id.in.(${idList}),recipient_id.in.(${idList})`);

  for (const id of targetIds) counts.set(id, 0);
  for (const row of theirs ?? []) {
    for (const targetId of [row.requester_id, row.recipient_id]) {
      if (!counts.has(targetId)) continue;
      const other = targetId === row.requester_id ? row.recipient_id : row.requester_id;
      if (other !== profileId && myConnected.has(other)) counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getMyConnections(profileId: string): Promise<ConnectionEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select(`*, requester:profiles!connections_requester_id_fkey(${PERSON_COLUMNS}), recipient:profiles!connections_recipient_id_fkey(${PERSON_COLUMNS})`)
    .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`)
    .order("created_at", { ascending: false });

  type Row = Tables<"connections"> & { requester: Tables<"profiles">; recipient: Tables<"profiles"> };
  const rows = (data ?? []) as Row[];

  const entries: ConnectionEntry[] = rows.map((row) => {
    const isRequester = row.requester_id === profileId;
    return {
      id: row.id,
      status: row.status as ConnectionStatus,
      direction: isRequester ? "outgoing" : "incoming",
      created_at: row.created_at,
      person: toDiscoverPerson(isRequester ? row.recipient : row.requester),
      mutuals: 0,
    };
  });

  const acceptedIds = entries.filter((e) => e.status === "accepted").map((e) => e.person.id);
  const mutuals = await getMutualCounts(profileId, acceptedIds);
  return entries.map((e) => ({ ...e, mutuals: mutuals.get(e.person.id) ?? 0 }));
}

/** Real, connectable members the viewer has no existing connection (pending or
 * accepted) with yet. */
export async function getSuggestedConnections(profileId: string): Promise<DiscoverPerson[]> {
  const supabase = await createClient();
  const [{ data: existing }, people] = await Promise.all([
    supabase.from("connections").select("requester_id, recipient_id").or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`),
    getRealDiscoverPeople(profileId),
  ]);

  const excluded = new Set((existing ?? []).map((row) => (row.requester_id === profileId ? row.recipient_id : row.requester_id)));
  return people.filter((p) => !excluded.has(p.id));
}
