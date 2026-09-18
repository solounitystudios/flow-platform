// Domain types used across the UI. Table-shaped types mirror lib/database.types.ts
// exactly so this layer can be swapped from mock data to live Supabase queries
// without changing component code — see lib/mock/README for the swap plan.

export type OpportunityType = "gig" | "job" | "project" | "volunteer";
export type OpportunityStatus = "draft" | "open" | "filled" | "completed" | "cancelled";
export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type ActivityType =
  | "workshop"
  | "volunteer_shift"
  | "training"
  | "class"
  | "networking"
  | "mentoring"
  | "creative_session"
  | "recreational"
  | "community";
export type ActivityStatus = "draft" | "published" | "cancelled" | "completed";
export type ActivityParticipantStatus = "registered" | "attended" | "completed" | "no_show" | "cancelled";

export interface MockPerson {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  city: string;
  state: string;
  bio: string;
  reliability_score: number;
  flow_points: number;
  available_now: boolean;
  skills: { name: string; verified: boolean; category: string }[];
  gigs_completed: number;
  events_attended: number;
  community_projects: number;
  recommendations: number;
  earned_cents: number;
  member_since: string;
}

export type OrganizationLocationVisibility = "exact" | "approximate" | "hidden" | "remote";

export interface MockOrganization {
  id: string;
  name: string;
  logo_url: string;
  city: string;
  state: string;
  description: string;
  verified: boolean;
  industry: string;
  member_perk: string | null;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  location_visibility: OrganizationLocationVisibility;
}

export interface MockOpportunity {
  id: string;
  organization: Pick<MockOrganization, "id" | "name" | "logo_url" | "verified">;
  title: string;
  description: string;
  opportunity_type: OpportunityType;
  status: OpportunityStatus;
  city: string;
  state: string;
  location_name: string;
  lat: number | null;
  lng: number | null;
  starts_at: string;
  ends_at: string | null;
  pay_cents: number | null;
  slots: number;
  slots_filled: number;
  distance_mi: number;
  urgent: boolean;
  category?: string | null;
  is_remote?: boolean;
}

export interface MockEvent {
  id: string;
  organization: Pick<MockOrganization, "id" | "name" | "logo_url" | "verified"> | null;
  title: string;
  description: string;
  city: string;
  state: string;
  venue: string;
  lat: number | null;
  lng: number | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  registered: number;
  status: EventStatus;
  cover_url: string;
  price_cents: number;
  category: string;
}

/** The joinable Activity object itself (workshop, volunteer shift, training
 * session, etc.) — distinct from `MockActivityItem` below, which is an
 * unrelated Passport/timeline feed-entry type (a record that something
 * happened, e.g. "gig_completed"). Do not confuse the two: this type
 * represents the thing a person can do; `MockActivityItem` represents a
 * feed entry about something that already happened (which could, in a
 * future PR, include an entry generated from this type's participation
 * outcome — but they remain separate types either way). */
export interface MockActivity {
  id: string;
  organization: Pick<MockOrganization, "id" | "name" | "logo_url" | "verified"> | null;
  eventId: string | null;
  eventTitle: string | null;
  title: string;
  description: string;
  activity_type: ActivityType;
  status: ActivityStatus;
  city: string;
  state: string;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  ends_at: string | null;
  capacity: number | null;
  registered: number;
}

export interface MockRecommendation {
  id: string;
  author: Pick<MockPerson, "id" | "full_name" | "avatar_url" | "username">;
  body: string;
  context: string;
  created_at: string;
}

export interface MockActivityItem {
  id: string;
  type: "gig_completed" | "event_attended" | "skill_verified" | "recommendation" | "points_earned" | "connection" | "project";
  actor: Pick<MockPerson, "id" | "full_name" | "avatar_url" | "username">;
  summary: string;
  detail?: string;
  created_at: string;
  points?: number;
}
