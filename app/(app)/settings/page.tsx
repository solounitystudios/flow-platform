import { redirect } from "next/navigation";
import { getAllSkills, getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { getMyIntents } from "@/lib/data/intents";
import { getMyVerifications, getCredentialTypes } from "@/lib/data/verifications";
import { getMyReferrals } from "@/lib/data/referrals";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { SkillsManager } from "@/components/settings/SkillsManager";
import { IntentManager } from "@/components/settings/IntentManager";
import { EvidencePanel } from "@/components/settings/EvidencePanel";
import { ReferralPanel } from "@/components/settings/ReferralPanel";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await getFullProfile(user.id);
  if (!full) redirect("/onboarding");

  const [allSkills, intents, verifications, credentialTypes, referrals] = await Promise.all([
    getAllSkills(),
    getMyIntents(user.id),
    getMyVerifications(user.id),
    getCredentialTypes(),
    getMyReferrals(user.id),
  ]);

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Profile</h2>
        </CardHeader>
        <CardBody>
          <ProfileForm profile={full.profile} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Goals</h2>
        </CardHeader>
        <CardBody>
          <IntentManager intents={intents} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Skills</h2>
        </CardHeader>
        <CardBody>
          <SkillsManager mySkills={full.skills} allSkills={allSkills} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Evidence &amp; verification</h2>
        </CardHeader>
        <CardBody>
          <EvidencePanel verifications={verifications} credentialTypes={credentialTypes} skills={allSkills} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Refer a friend</h2>
        </CardHeader>
        <CardBody>
          <ReferralPanel referrals={referrals} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-bold text-ink-900 dark:text-white">Account</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-500 dark:text-ink-400">Signed in as {user.email}</p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" size="sm">Sign out</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
