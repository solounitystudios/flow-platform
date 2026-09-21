import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicClaimsForProfile } from "@/lib/passport/data";
import { presentPublicClaim } from "@/lib/passport/domain";
import { getCurrentUser, getFullProfileByUsername } from "@/lib/data/profile";
import { getReliabilityBreakdown } from "@/lib/data/reliability";
import { getConnectionStatus, getSharedSkills } from "@/lib/data/connections";
import { findMockPersonByUsername, mockPersonToPassportData, mockPersonToRecommendations, mockPersonToSkills } from "@/lib/mock/passport-adapter";
import { isDemoModeEnabled } from "@/lib/demo";
import { PassportCard } from "@/components/passport/PassportCard";
import { SkillsList } from "@/components/passport/SkillsList";
import { RecommendationsList } from "@/components/passport/RecommendationsList";
import { ReliabilityCard } from "@/components/passport/ReliabilityCard";
import { PublicPassportShell as PassportShell } from "@/components/passport/PublicPassportShell";
import { PublicVerifiedClaims } from "@/components/passport/PublicVerifiedClaims";
import { ConnectionControl } from "@/components/social/ConnectionControl";
import { ConnectionMoreMenu } from "@/components/social/ConnectionMoreMenu";
import { MessageButton } from "@/components/messages/MessageButton";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { flowIdFromUuid } from "@/lib/passport";
import { startDirectConversationAction } from "@/lib/actions";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}'s FLOW Passport` };
}

export default async function PublicPassportPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const full = await getFullProfileByUsername(username);

  if (!full) {
    // A nonexistent Passport must 404 in production. Mock people only exist
    // as a local-dev convenience so Discover/Connections/activity-feed demo
    // links don't dead-end — never a stand-in for a real, unclaimed username.
    const mockPerson = isDemoModeEnabled() ? findMockPersonByUsername(username) : null;
    if (!mockPerson) notFound();

    return (
      <PassportShell>
        <PassportCard data={mockPersonToPassportData(mockPerson)} />
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">Skills</h2>
          </CardHeader>
          <CardBody>
            <SkillsList skills={mockPersonToSkills(mockPerson)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">Recommendations</h2>
          </CardHeader>
          <CardBody>
            <RecommendationsList recommendations={mockPersonToRecommendations(mockPerson)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">About</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-600 dark:text-ink-300">{mockPerson.bio}</p>
          </CardBody>
        </Card>
        <JoinCta />
      </PassportShell>
    );
  }

  const { profile, passport, skills, recommendations } = full;
  const breakdown = await getReliabilityBreakdown(profile.id);
  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === profile.id;
  const [connectionState, sharedSkills] = await Promise.all([
    viewer && !isSelf ? getConnectionStatus(viewer.id, profile.id) : Promise.resolve(null),
    viewer && !isSelf ? getSharedSkills(viewer.id, profile.id) : Promise.resolve([]),
  ]);

  if (!profile.public_passport) {
    return (
      <PassportShell>
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-16 text-center">
            <Lock className="h-8 w-8 text-ink-300" />
            <p className="font-semibold text-ink-900 dark:text-white">This Passport is private</p>
            <p className="text-sm text-ink-400">@{username} has chosen not to share their Passport publicly.</p>
          </CardBody>
        </Card>
      </PassportShell>
    );
  }

  // Only reached for a public Passport. The rows come from the allow-listed passport_public_claims() projection —
  // the database has already decided which claims are shareable and returns nothing else; the raw claims table is
  // not public. presentPublicClaim then builds each title from the allow-listed fields only.
  const publicClaims = (await getPublicClaimsForProfile(await createClient(), profile.id)).map(presentPublicClaim);

  return (
    <PassportShell>
      <PassportCard
        data={{
          fullName: profile.full_name || "FLOW Member",
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

      {connectionState && (
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-900 dark:text-white">{profile.full_name || "This member"}</p>
                {sharedSkills.length > 0 && <p className="text-xs text-ink-400">{sharedSkills.length} shared skill{sharedSkills.length === 1 ? "" : "s"}: {sharedSkills.join(", ")}</p>}
              </div>
              <div className="flex items-center gap-2">
                {connectionState.status === "connected" && (
                  <MessageButton start={startDirectConversationAction.bind(null, profile.id)} />
                )}
                <ConnectionControl
                  personId={profile.id}
                  personName={profile.full_name || "this member"}
                  initialStatus={connectionState.status}
                  initialConnectionId={connectionState.connectionId}
                />
              </div>
            </div>
            {connectionState.status !== "blocked" && (
              <div className="border-t border-ink-100 pt-3 dark:border-ink-800">
                <ConnectionMoreMenu personId={profile.id} personName={profile.full_name || "this member"} isBlocked={false} />
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {publicClaims.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-bold text-ink-900 dark:text-white">Verified activity</h2>
          </CardHeader>
          <CardBody>
            <PublicVerifiedClaims claims={publicClaims} username={username} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Skills</h2>
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

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Reliability</h2>
        </CardHeader>
        <CardBody>
          <ReliabilityCard breakdown={breakdown} />
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

      <JoinCta />
    </PassportShell>
  );
}

function JoinCta() {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 p-5 text-center dark:border-ink-700">
      <p className="text-sm text-ink-500 dark:text-ink-400">Want a Passport like this?</p>
      <Button href="/signup" size="sm" className="mt-3">
        Join FLOW free
      </Button>
    </div>
  );
}
