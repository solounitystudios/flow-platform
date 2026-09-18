import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/geo";
import { dicebearAvatar } from "@/lib/utils";
import type { MockActivity } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

// No demo-mode fixtures yet for Activities (unlike getUpcomingEvents/
// getOpenOpportunities) — PR A's approved scope is schema+auth+basic UI+map
// only; demo content is a deferred, non-essential nice-to-have, not part of
// this batch. Every function here returns real, Supabase-backed rows only.

type RealActivityRow = Tables<"activities"> & {
  organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null;
  event: Pick<Tables<"events">, "id" | "title"> | null;
};

function toCardShape(row: RealActivityRow, registered: number): MockActivity {
  return {
    id: row.id,
    organization: row.organization
      ? { id: row.organization.id, name: row.organization.name, logo_url: dicebearAvatar(row.organization.name), verified: row.organization.verified }
      : null,
    eventId: row.event?.id ?? null,
    eventTitle: row.event?.title ?? null,
    title: row.title,
    description: row.description ?? "",
    activity_type: row.activity_type as MockActivity["activity_type"],
    status: row.status as MockActivity["status"],
    city: row.city,
    state: row.state,
    venue: row.venue,
    address: row.address,
    // Never fabricate a location: only expose real, geocoded coordinates —
    // a missing lat/lng must render as "no pin", not a silent city-center
    // guess, matching lib/data/events.ts's toCardShape convention exactly.
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    capacity: row.capacity,
    registered,
  };
}

async function getRegisteredCounts(activityIds: string[]) {
  const counts = new Map<string, number>();
  if (activityIds.length === 0) return counts;
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_participants")
    .select("activity_id, status")
    .in("activity_id", activityIds)
    .in("status", ["registered", "attended", "completed"]);
  for (const p of data ?? []) counts.set(p.activity_id, (counts.get(p.activity_id) ?? 0) + 1);
  return counts;
}

const SELECT_WITH_RELATIONS = "*, organization:organizations(id, name, verified), event:events(id, title)";

/** Real, Supabase-backed published activities, soonest-first (nulls last —
 * an undated activity is a deliberate product case, not an error, so it
 * sorts after every dated one rather than being excluded). */
export async function getUpcomingActivities(): Promise<MockActivity[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("activities")
    .select(SELECT_WITH_RELATIONS)
    .eq("status", "published")
    .order("starts_at", { ascending: true, nullsFirst: false });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  return real.map((r) => toCardShape(r as RealActivityRow, counts.get(r.id) ?? 0));
}

/** Published activities belonging to one event — the "Activities inside
 * this Event" section on the event's manage/detail page. An Activity is
 * never required to have an event, so this is additive, not a replacement
 * for anything events already renders. */
export async function getActivitiesForEvent(eventId: string): Promise<MockActivity[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("activities")
    .select(SELECT_WITH_RELATIONS)
    .eq("event_id", eventId)
    .eq("status", "published")
    .order("starts_at", { ascending: true, nullsFirst: false });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  return real.map((r) => toCardShape(r as RealActivityRow, counts.get(r.id) ?? 0));
}

/** Published activities belonging to one organization — for the public
 * organization page (app/o/[id]), same shape/shaping as
 * getEventsByOrganizationPublic. */
export async function getActivitiesForOrganization(organizationId: string): Promise<MockActivity[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("activities")
    .select(SELECT_WITH_RELATIONS)
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .order("starts_at", { ascending: true, nullsFirst: false });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  return real.map((r) => toCardShape(r as RealActivityRow, counts.get(r.id) ?? 0));
}

/** All activities a given profile created — the host's "My Activities"
 * manage list. Includes drafts (this is the creator's own management view,
 * not a public listing), unlike the getUpcoming/getFor* functions above. */
export async function getActivitiesByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("*").eq("created_by", creatorId).order("created_at", { ascending: false });
  return data ?? [];
}

export interface MyParticipation {
  id: string;
  status: string;
  checked_in_at: string | null;
}

export interface ActivityDetail extends MockActivity {
  isOwner: boolean;
  myParticipation: MyParticipation | null;
}

export async function getActivityDetail(id: string, viewerId: string | null): Promise<ActivityDetail | null> {
  if (!isUuid(id)) return null;

  const supabase = await createClient();
  const { data: row } = await supabase.from("activities").select(SELECT_WITH_RELATIONS).eq("id", id).maybeSingle();
  if (!row) return null;

  const { data: participantRows } = await supabase
    .from("activity_participants")
    .select("id, status")
    .eq("activity_id", id)
    .in("status", ["registered", "attended", "completed"]);

  const mine = viewerId
    ? await supabase.from("activity_participants").select("id, status, checked_in_at").eq("activity_id", id).eq("profile_id", viewerId).maybeSingle()
    : null;

  const shaped = toCardShape(row as RealActivityRow, (participantRows ?? []).length);

  return {
    ...shaped,
    isOwner: viewerId === row.created_by,
    myParticipation: (mine?.data as MyParticipation | undefined) ?? null,
  };
}

export type ActivityParticipantRow = Tables<"activity_participants"> & { profile: Tables<"profiles"> };

/** Participant roster for a host's manage view — RLS (`activity_participants_participant_read`)
 * independently restricts this to the activity's own host or a participant
 * viewing their own row; this function does not itself enforce that, same
 * division of responsibility as getAttendeesForEvent. */
export async function getParticipantsForActivity(activityId: string): Promise<ActivityParticipantRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activity_participants")
    .select("*, profile:profiles!activity_participants_profile_id_fkey(*)")
    .eq("activity_id", activityId)
    .order("joined_at", { ascending: true });

  return (data ?? []) as ActivityParticipantRow[];
}

export type ActivityLinkCandidate = Pick<Tables<"activities">, "id" | "organization_id" | "created_by" | "title" | "status">;

/** Single source of the activity row a create/manage action needs for
 * server-side authorization (lib/authz.ts canManageActivity/
 * canLinkActivityToOrganization) — never trusting a client-supplied
 * activity_id, same convention as lib/data/events.ts getEventForLinking. */
export async function getActivityForManage(activityId: string): Promise<ActivityLinkCandidate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("activities").select("id, organization_id, created_by, title, status").eq("id", activityId).maybeSingle();
  return data ?? null;
}

export type ActivityEventLinkCandidate = Pick<Tables<"events">, "id" | "organization_id" | "created_by" | "title" | "status">;

/** Single source of the event row an Activity create/update action needs
 * for the FLOW-SEC-002-style canLinkActivityToEvent check — server-side,
 * never trusting a client-supplied event_id, mirroring
 * lib/data/events.ts's getEventForLinking exactly. */
export async function getEventForActivityLinking(eventId: string): Promise<ActivityEventLinkCandidate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id, organization_id, created_by, title, status").eq("id", eventId).maybeSingle();
  return data ?? null;
}
