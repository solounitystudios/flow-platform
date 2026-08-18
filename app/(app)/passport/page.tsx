import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { getReliabilityBreakdown } from "@/lib/data/reliability";
import { getAllAchievements, getEarnedAchievements } from "@/lib/data/achievements";
import { PassportCard } from "@/components/passport/PassportCard";
import { PassportActions } from "@/components/passport/PassportActions";
import { SkillsList } from "@/components/passport/SkillsList";
import { RecommendationsList } from "@/components/passport/RecommendationsList";
import { ReliabilityCard } from "@/components/passport/ReliabilityCard";
import { Achievements } from "@/components/passport/Achievements";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { flowIdFromUuid } from "@/lib/passport";

export default async function PassportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await getFullProfile(user.id);
  if (!full) redirect("/onboarding");

  const { profile, passport, skills, recommendations } = full;
  const username = profile.username ?? user.id.slice(0, 8);
  const breakdown = await getReliabilityBreakdown(user.id);
  const [allAchievements, earnedAchievements] = await Promise.all([getAllAchievements(), getEarnedAchievements(user.id)]);

  return (
    <div className="space-y-6">
      <PassportCard
        data={{
          fullName: profile.full_name || "New FLOW Member",
          username: profile.username,
          avatarUrl: profile.avatar_url,
          city: profile.city,
          state: profile.state,
          flowId: flowIdFromUuid(profile.id),
          reliabilityScore: passport.reliability_score ?? 100,
          flowPoints: passport.flow_points ?? 0,
          gigsCompleted: passport.gigs_completed ?? 0,
          skillsVerified: passport.skills_verified ?? 0,
          eventsAttended: passport.events_attended ?? 0,
          communityProjects: 0,
          recommendationsCount: passport.recommendations ?? 0,
          earnedCents: passport.earned_cents ?? 0,
          memberSince: profile.created_at,
          availableNow: profile.available_now,
          verified: (passport.skills_verified ?? 0) > 0,
        }}
      />

      <Card>
        <CardBody>
          <PassportActions username={username} initialPublic={profile.public_passport} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Achievements</h2>
          {allAchievements.length > 0 && (
            <span className="text-sm text-ink-400">
              {earnedAchievements.length} of {allAchievements.length} unlocked
            </span>
          )}
        </CardHeader>
        <CardBody>
          <Achievements all={allAchievements} earned={earnedAchievements} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Reliability</h2>
        </CardHeader>
        <CardBody>
          <ReliabilityCard breakdown={breakdown} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Skills</h2>
          <Link href="/settings" className="flex items-center gap-1 text-sm font-medium text-flow-600">
            <Settings className="h-3.5 w-3.5" /> Manage
          </Link>
        </CardHeader>
        <CardBody>
          <SkillsList skills={skills} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Recommendations</h2>
        </CardHeader>
        <CardBody>
          <RecommendationsList recommendations={recommendations} />
        </CardBody>
      </Card>

      {profile.bio && (
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">About</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-600 dark:text-ink-300">{profile.bio}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
