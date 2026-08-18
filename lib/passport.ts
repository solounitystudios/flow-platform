export interface PassportData {
  fullName: string;
  username: string | null;
  avatarUrl?: string | null;
  city: string;
  state: string;
  flowId: string;
  reliabilityScore: number;
  flowPoints: number;
  gigsCompleted: number;
  skillsVerified: number;
  eventsAttended: number;
  communityProjects: number;
  recommendationsCount: number;
  earnedCents: number;
  memberSince: string;
  availableNow: boolean;
  verified: boolean;
}

export function flowIdFromUuid(id: string) {
  return `FLOW-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
