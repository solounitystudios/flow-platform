import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationByOwner } from "@/lib/data/organization";
import { Card, CardBody } from "@/components/ui/Card";
import { PostActivityForm } from "@/components/activities/PostActivityForm";

/** Unlike PostEventPage, an Activity never requires an organization — a
 * signed-in individual with no business at all may still host one (see
 * PostActivityForm's own doc comment). getOrganizationByOwner returning
 * null here is a normal, supported case, not a redirect-worthy one. */
export default async function PostActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await getOrganizationByOwner(user.id);

  return (
    <div className="space-y-5">
      <Link href="/activities" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to activities
      </Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Host an activity</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Workshops, volunteer shifts, training, classes, and community sessions — anyone can host one.
        </p>
      </div>
      <Card>
        <CardBody>
          <PostActivityForm organizationId={org?.id ?? null} organizationName={org?.name ?? null} />
        </CardBody>
      </Card>
    </div>
  );
}
