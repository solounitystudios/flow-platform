import { redirect } from "next/navigation";
import { Briefcase, Building2, Compass, Plus, Users, Star, CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationByOwner } from "@/lib/data/organization";
import { getOpportunitiesByCreator } from "@/lib/data/opportunities";
import { getApplicantCounts } from "@/lib/data/applications";
import { getEventsByCreator, getAttendeeCounts } from "@/lib/data/events";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { OpportunityRow } from "@/components/business/OpportunityRow";
import { EventRow } from "@/components/business/EventRow";
import { CreateOrganizationForm } from "@/components/business/CreateOrganizationForm";

export default async function BusinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const org = await getOrganizationByOwner(user.id);

  if (!org) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <Building2 className="mx-auto h-8 w-8 text-flow-600" />
          <h1 className="mt-2 text-xl font-bold text-ink-900 dark:text-white">Set up your business profile</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Post gigs and jobs, discover talent, and sponsor local events.</p>
        </div>
        <Card>
          <CardBody>
            <CreateOrganizationForm />
          </CardBody>
        </Card>
      </div>
    );
  }

  const postings = await getOpportunitiesByCreator(user.id);
  const openCount = postings.filter((p) => p.status === "open").length;
  const applicantCounts = await getApplicantCounts(postings.map((p) => p.id));

  const events = await getEventsByCreator(user.id);
  const attendeeCounts = await getAttendeeCounts(events.map((e) => e.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{org.name}</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {org.city}, {org.state} {org.verified ? "· Verified business" : "· Verification pending"}
          </p>
        </div>
        <Button href="/business/post">
          <Plus className="h-4 w-4" /> Post an opportunity
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Open postings" value={openCount} icon={<Briefcase className="h-3.5 w-3.5" />} />
        <StatTile label="Total postings" value={postings.length} icon={<Building2 className="h-3.5 w-3.5" />} />
        <StatTile label="Rating" value="—" icon={<Star className="h-3.5 w-3.5" />} accent="gold" />
        <StatTile label="Followers" value="—" icon={<Users className="h-3.5 w-3.5" />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button href="/discover" variant="outline" className="justify-start">
          <Compass className="h-4 w-4" /> Search FLOW talent
        </Button>
        <Button href="/business/events/new" variant="outline" className="justify-start">
          <CalendarDays className="h-4 w-4" /> Host an event
        </Button>
      </div>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Your postings</h2>
        {postings.length > 0 ? (
          <div className="space-y-2.5">
            {postings.map((p) => (
              <OpportunityRow key={p.id} opportunity={p} applicantCount={applicantCounts.get(p.id) ?? 0} />
            ))}
          </div>
        ) : (
          <EmptyState title="No postings yet" body="Post your first gig or job to start reaching FLOW members." action={<Button href="/business/post" size="sm">Post an opportunity</Button>} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Your events</h2>
        {events.length > 0 ? (
          <div className="space-y-2.5">
            {events.map((e) => (
              <EventRow key={e.id} event={e} attendeeCount={attendeeCounts.get(e.id) ?? 0} />
            ))}
          </div>
        ) : (
          <EmptyState title="No events yet" body="Host your first event to bring FLOW members together." action={<Button href="/business/events/new" size="sm">Host an event</Button>} />
        )}
      </section>
    </div>
  );
}
