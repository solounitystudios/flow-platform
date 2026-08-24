import { createClient } from "@/lib/supabase/server";
import { mockEvents } from "@/lib/mock/data";
import { isUuid } from "@/lib/geo";
import { dicebearAvatar } from "@/lib/utils";
import { isDemoModeEnabled } from "@/lib/demo";
import type { MockEvent } from "@/lib/types";
import type { Tables } from "@/lib/database.types";

type RealEventRow = Tables<"events"> & {
  organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null;
};

function toCardShape(row: RealEventRow, registered: number): MockEvent {
  return {
    id: row.id,
    organization: row.organization
      ? { id: row.organization.id, name: row.organization.name, logo_url: dicebearAvatar(row.organization.name), verified: row.organization.verified }
      : null,
    title: row.title,
    description: row.description ?? "",
    city: row.city,
    state: row.state,
    venue: row.venue ?? row.address ?? row.city,
    // Never fabricate a location: only expose real, geocoded coordinates.
    // A missing lat/lng must render as "no pin", not a silent city-center guess.
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    starts_at: row.starts_at,
    ends_at: row.ends_at ?? row.starts_at,
    capacity: row.capacity ?? 999999,
    registered,
    status: row.status as MockEvent["status"],
    cover_url: row.image_url ?? dicebearAvatar(row.title),
    price_cents: row.ticket_price_cents ?? 0,
    category: row.category ?? "Community",
  };
}

async function getRegisteredCounts(eventIds: string[]) {
  const counts = new Map<string, number>();
  if (eventIds.length === 0) return counts;
  const supabase = await createClient();
  const { data } = await supabase.from("event_attendance").select("event_id, status").in("event_id", eventIds).in("status", ["registered", "attended"]);
  for (const a of data ?? []) counts.set(a.event_id, (counts.get(a.event_id) ?? 0) + 1);
  return counts;
}

/** Real, Supabase-backed published events. When NEXT_PUBLIC_FLOW_DEMO_MODE is
 * enabled, supplemented with demo content so the events tab never looks empty
 * before the platform has real multi-city supply — off (the default) returns
 * real rows only. */
export async function getUpcomingEvents(): Promise<MockEvent[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("events")
    .select("*, organization:organizations(id, name, verified)")
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  const realShaped = real.map((r) => toCardShape(r as RealEventRow, counts.get(r.id) ?? 0));
  if (!isDemoModeEnabled()) return realShaped;
  return [...realShaped, ...mockEvents.filter((e) => e.status === "published")];
}

/** Upcoming published events for one organization — for the public
 * organization page (app/o/[id]). Same shape/shaping as getUpcomingEvents,
 * just scoped by organization_id. */
export async function getEventsByOrganizationPublic(organizationId: string): Promise<MockEvent[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("events")
    .select("*, organization:organizations(id, name, verified)")
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  return real.map((r) => toCardShape(r as RealEventRow, counts.get(r.id) ?? 0));
}

export async function getPastEvents(): Promise<MockEvent[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("events")
    .select("*, organization:organizations(id, name, verified)")
    .eq("status", "completed")
    .order("starts_at", { ascending: false });

  const real = rows ?? [];
  const counts = await getRegisteredCounts(real.map((r) => r.id));
  const realShaped = real.map((r) => toCardShape(r as RealEventRow, counts.get(r.id) ?? 0));
  if (!isDemoModeEnabled()) return realShaped;
  return [...realShaped, ...mockEvents.filter((e) => e.status === "completed")];
}

export interface MyAttendance {
  id: string;
  status: string;
  checkin_code: string;
  ticket_type: string;
}

export interface EventDetail extends MockEvent {
  source: "real" | "mock";
  isOwner: boolean;
  isPaid: boolean;
  isPublic: boolean;
  ageRestriction: string | null;
  address: string | null;
  tags: string[];
  myAttendance: MyAttendance | null;
}

export async function getEventDetail(id: string, viewerId: string | null): Promise<EventDetail | null> {
  if (!isUuid(id)) {
    if (!isDemoModeEnabled()) return null;
    const mock = mockEvents.find((e) => e.id === id);
    if (!mock) return null;
    return { ...mock, source: "mock", isOwner: false, isPaid: mock.price_cents > 0, isPublic: true, ageRestriction: null, address: null, tags: [], myAttendance: null };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("events")
    .select("*, organization:organizations(id, name, verified)")
    .eq("id", id)
    .maybeSingle();

  if (!row) return null;

  const { data: attendanceRows } = await supabase
    .from("event_attendance")
    .select("id, status")
    .eq("event_id", id)
    .in("status", ["registered", "attended"]);

  const mine = viewerId
    ? await supabase.from("event_attendance").select("id, status, checkin_code, ticket_type").eq("event_id", id).eq("profile_id", viewerId).maybeSingle()
    : null;

  const shaped = toCardShape(row as RealEventRow, (attendanceRows ?? []).length);

  return {
    ...shaped,
    source: "real",
    isOwner: viewerId === row.created_by,
    isPaid: row.is_paid,
    isPublic: row.is_public,
    ageRestriction: row.age_restriction,
    address: row.address,
    tags: row.tags ?? [],
    myAttendance: (mine?.data as MyAttendance | undefined) ?? null,
  };
}

export type TicketRow = Tables<"event_attendance"> & {
  event: Tables<"events"> & { organization: Pick<Tables<"organizations">, "id" | "name" | "verified"> | null };
};

export async function getMyTickets(profileId: string): Promise<TicketRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_attendance")
    .select("*, event:events(*, organization:organizations(id, name, verified))")
    .eq("profile_id", profileId)
    .order("reserved_at", { ascending: false });

  return (data ?? []) as TicketRow[];
}

export type AttendeeRow = Tables<"event_attendance"> & { profile: Tables<"profiles"> };

export async function getAttendeesForEvent(eventId: string): Promise<AttendeeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_attendance")
    .select("*, profile:profiles!event_attendance_profile_id_fkey(*)")
    .eq("event_id", eventId)
    .order("reserved_at", { ascending: true });

  return (data ?? []) as AttendeeRow[];
}

export async function getAttendeeCounts(eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, number>();
  const supabase = await createClient();
  const { data } = await supabase.from("event_attendance").select("event_id").in("event_id", eventIds);
  const counts = new Map<string, number>();
  for (const row of data ?? []) counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  return counts;
}

export async function getEventsByCreator(creatorId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("*").eq("created_by", creatorId).order("created_at", { ascending: false });
  return data ?? [];
}

export type EventLinkCandidate = Pick<Tables<"events">, "id" | "organization_id" | "created_by" | "title" | "venue" | "city" | "state" | "status">;

/** Single source of the event row `createOpportunityAction` needs for the
 * FLOW-SEC-002 organization-integrity check (lib/authz.ts
 * canLinkOpportunityToEvent) — server-side, never trusting a
 * client-supplied event_id — and, on success, the same fields the
 * "linked to event" pre-fill in PostOpportunityForm.tsx displays. One
 * lookup serves both, per this batch's "prefer existing functions over a
 * duplicate API" scope. `status` is included so the same server-side check
 * can also reject a cancelled/completed event, matching the picker's own
 * eligibility filter (app/(app)/business/post/page.tsx). */
export async function getEventForLinking(eventId: string): Promise<EventLinkCandidate | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("events").select("id, organization_id, created_by, title, venue, city, state, status").eq("id", eventId).maybeSingle();
  return data ?? null;
}
