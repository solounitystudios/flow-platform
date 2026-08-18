import { redirect } from "next/navigation";
import { getAllSkills, getCurrentUser } from "@/lib/data/profile";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const skills = await getAllSkills();
  const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-5 py-12 dark:bg-ink-950">
      <OnboardingFlow fullName={fullName} skills={skills} />
    </div>
  );
}
