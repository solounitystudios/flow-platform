import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationByOwner } from "@/lib/data/organization";
import { getEventsByCreator } from "@/lib/data/events";
import { Card, CardBody } from "@/components/ui/Card";
import { PostOpportunityForm } from "@/components/business/PostOpportunityForm";

export default async function PostOpportunityPage({ searchParams }: { searchParams: Promise<{ event_id?: string }> }) {
  const { event_id } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await getOrganizationByOwner(user.id);
  if (!org) redirect("/business");

  // Batch A (Event Team Builder): only this organization's own,
  // still-live events are eligible to link — mirrors the server-side
  // FLOW-SEC-002 check in createOpportunityAction, this is just the
  // UI-side narrowing so the picker never even offers an ineligible event.
  const ownEvents = await getEventsByCreator(user.id);
  const eligibleEvents = ownEvents.filter((e) => e.organization_id === org.id && e.status !== "cancelled" && e.status !== "completed");
  const linkedEvent = event_id ? (eligibleEvents.find((e) => e.id === event_id) ?? null) : null;

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
          <PostOpportunityForm organizationId={org.id} eligibleEvents={eligibleEvents} linkedEvent={linkedEvent} />
        </CardBody>
      </Card>
    </div>
  );
}
