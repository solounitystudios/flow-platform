import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationByOwner } from "@/lib/data/organization";
import { Card, CardBody } from "@/components/ui/Card";
import { PostOpportunityForm } from "@/components/business/PostOpportunityForm";

export default async function PostOpportunityPage() {
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
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">Post an opportunity</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Posting as {org.name}.</p>
      </div>
      <Card>
        <CardBody>
          <PostOpportunityForm organizationId={org.id} />
        </CardBody>
      </Card>
    </div>
  );
}
