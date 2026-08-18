import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationByOwner } from "@/lib/data/organization";
import { Card, CardBody } from "@/components/ui/Card";
import { PostEventForm } from "@/components/business/PostEventForm";

export default async function PostEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await getOrganizationByOwner(user.id);
  if (!org) redirect("/business");

  return (
    <div className="space-y-5">
      <Link href="/business" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to business dashboard
      </Link>
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Create an event</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Publishing as {org.name}.</p>
      </div>
      <Card>
        <CardBody>
          <PostEventForm organizationId={org.id} />
        </CardBody>
      </Card>
    </div>
  );
}
