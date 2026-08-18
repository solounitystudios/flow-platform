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

/** Pending + accepted rows only — blocked relationships are managed separately
 * via getBlockedProfiles() so a blocked party never surfaces in the normal list. */
export async function getMyConnections(profileId: string): Promise<ConnectionEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select(`*, requester:profiles!connections_requester_id_fkey(${PERSON_COLUMNS}), recipient:profiles!connections_recipient_id_fkey(${PERSON_COLUMNS})`)
    .in("status", ["pending", "accepted"])
    .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`)
    .order("created_at", { ascending: false });

  type Row = Tables<"connections"> & { requester: Tables<"profiles"> | null; recipient: Tables<"profiles"> | null };
  const rows = (data ?? []) as Row[];

  const entries: ConnectionEntry[] = rows
    .filter((row) => row.requester && row.recipient)
    .map((row) => {
      const isRequester = row.requester_id === profileId;
      return {
        id: row.id,
        status: row.status as ConnectionStatus,
        direction: isRequester ? "outgoing" : ("incoming" as const),
        created_at: row.created_at,
        person: toDiscoverPerson(isRequester ? row.recipient! : row.requester!),
        mutuals: 0,
      };
    });

  const acceptedIds = entries.filter((e) => e.status === "accepted").map((e) => e.person.id);
  const mutuals = await getMutualCounts(profileId, acceptedIds);
  return entries.map((e) => ({ ...e, mutuals: mutuals.get(e.person.id) ?? 0 }));
}

export interface BlockedEntry {
  id: string;
  person: DiscoverPerson;
  blocked_at: string;
}

/** People this profile has blocked. Goes through get_my_blocked_profiles()
 * rather than a direct profiles join — the profiles_block_restrict RLS policy
 * is intentionally symmetric (neither blocked party can see the other's
 * profile), so a plain join would return nulls here for the blocker too. */
export async function getBlockedProfiles(): Promise<BlockedEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_blocked_profiles");

  return (data ?? []).map((row) => ({
    id: row.connection_id,
    blocked_at: row.blocked_at,
    person: {
      id: row.profile_id,
      username: row.username ?? row.profile_id.slice(0, 8),
      full_name: row.full_name ?? "FLOW Member",
      avatar_url: row.avatar_url ?? dicebearAvatar(row.username ?? row.profile_id),
      city: row.city,
      state: row.state,
      bio: "",
      reliability_score: 0,
      available_now: false,
    },
  }));
}

/** Real, connectable members the viewer has no existing connection (pending,
 * accepted, or blocked either direction) with yet. Blocked-by-either-party
 * profiles are also already invisible via RLS — this filter is defense in depth. */
export async function getSuggestedConnections(profileId: string): Promise<DiscoverPerson[]> {
  const supabase = await createClient();
  const [{ data: existing }, people] = await Promise.all([
    supabase.from("connections").select("requester_id, recipient_id").or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`),
    getRealDiscoverPeople(profileId),
  ]);

  const excluded = new Set((existing ?? []).map((row) => (row.requester_id === profileId ? row.recipient_id : row.requester_id)));
  return people.filter((p) => !excluded.has(p.id));
}

export type ConnectionUiStatus = "connected" | "pending_incoming" | "pending_outgoing" | "suggested" | "blocked";

export interface ConnectionState {
  status: ConnectionUiStatus;
  connectionId: string | null;
}

/** Batched relationship lookup for a list of people (Discover, Suggested)
 * so cards don't each fire their own query. */
export async function getConnectionStatuses(viewerId: string, targetIds: string[]): Promise<Map<string, ConnectionState>> {
  const map = new Map<string, ConnectionState>();
  if (targetIds.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, requester_id, recipient_id, status")
    .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`);

  const targetSet = new Set(targetIds);
  for (const row of data ?? []) {
    const otherId = row.requester_id === viewerId ? row.recipient_id : row.requester_id;
    if (!targetSet.has(otherId)) continue;

    let status: ConnectionUiStatus;
    if (row.status === "blocked") status = "blocked";
    else if (row.status === "accepted") status = "connected";
    else status = row.requester_id === viewerId ? "pending_outgoing" : "pending_incoming";

    map.set(otherId, { status, connectionId: row.id });
  }
  return map;
}

export async function getConnectionStatus(viewerId: string, targetId: string): Promise<ConnectionState> {
  const map = await getConnectionStatuses(viewerId, [targetId]);
  return map.get(targetId) ?? { status: "suggested", connectionId: null };
}

/** Skills the viewer and target have in common — cheap enough for a single
 * profile-page lookup, not batched across a whole suggested list. */
export async function getSharedSkills(viewerId: string, targetId: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: mine }, { data: theirs }] = await Promise.all([
    supabase.from("profile_skills").select("skill_id, skill:skills(name)").eq("profile_id", viewerId),
    supabase.from("profile_skills").select("skill_id, skill:skills(name)").eq("profile_id", targetId),
  ]);

  type Row = { skill_id: string; skill: { name: string } | null };
  const mineIds = new Set(((mine ?? []) as Row[]).map((r) => r.skill_id));
  return ((theirs ?? []) as Row[]).filter((r) => mineIds.has(r.skill_id) && r.skill).map((r) => r.skill!.name);
}
