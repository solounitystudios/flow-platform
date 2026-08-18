import { redirect } from "next/navigation";
import { getAllSkills, getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { SkillsManager } from "@/components/settings/SkillsManager";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/Button";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await getFullProfile(user.id);
  if (!full) redirect("/onboarding");

  const allSkills = await getAllSkills();

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
          <h2 className="font-bold text-ink-900 dark:text-white">Skills</h2>
        </CardHeader>
        <CardBody>
          <SkillsManager mySkills={full.skills} allSkills={allSkills} />
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
