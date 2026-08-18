import { mockPeople, mockRecommendations } from "@/lib/mock/data";
import type { PassportData } from "@/lib/passport";
import type { Tables } from "@/lib/database.types";

// Lets /p/[username] resolve demo people from lib/mock/data (Discover, Connections,
// and the activity feed all link to them) even though they have no real Supabase row.
// A real signed-up user's row always wins — this is only a fallback.
export function findMockPersonByUsername(username: string) {
  return mockPeople.find((p) => p.username === username) ?? null;
}

export function mockPersonToPassportData(person: (typeof mockPeople)[number]): PassportData {
  return {
    fullName: person.full_name,
    username: person.username,
    avatarUrl: person.avatar_url,
    city: person.city,
    state: person.state,
    flowId: `FLOW-${person.id.toUpperCase()}`,
    reliabilityScore: person.reliability_score,
    flowPoints: person.flow_points,
    gigsCompleted: person.gigs_completed,
    skillsVerified: person.skills.filter((s) => s.verified).length,
    eventsAttended: person.events_attended,
    communityProjects: person.community_projects,
    recommendationsCount: person.recommendations,
    earnedCents: person.earned_cents,
    memberSince: person.member_since,
    availableNow: person.available_now,
    verified: true,
  };
}

export function mockPersonToSkills(person: (typeof mockPeople)[number]) {
  return person.skills.map((s) => ({
    profile_id: person.id,
    skill_id: s.name,
    verified: s.verified,
    verified_at: s.verified ? person.member_since : null,
    skill: { id: s.name, name: s.name, category: s.category, created_at: person.member_since },
  })) satisfies (Tables<"profile_skills"> & { skill: Tables<"skills"> })[];
}

export function mockPersonToRecommendations(person: (typeof mockPeople)[number]) {
  return mockRecommendations
    .filter((r) => person.username === "jmartinez")
    .map((r) => ({
      id: r.id,
      author_id: r.author.id,
      recipient_id: person.id,
      opportunity_id: null,
      body: r.body,
      created_at: r.created_at,
      author: {
        id: r.author.id,
        full_name: r.author.full_name,
        username: r.author.username,
        avatar_url: r.author.avatar_url,
        bio: null,
        city: "",
        state: "",
        available_now: false,
        reliability_score: 100,
        flow_points: 0,
        public_passport: true,
        created_at: "",
        updated_at: "",
      },
    })) satisfies (Tables<"recommendations"> & { author: Tables<"profiles"> })[];
}
