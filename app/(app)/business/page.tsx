import { redirect } from "next/navigation";
import { Briefcase, Building2, Compass, Plus, Users, Star, CalendarDays, Mail } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getOrganizationForMember, getPendingInvitationsForProfile } from "@/lib/data/organization";
import { getOpportunitiesByCreator } from "@/lib/data/opportunities";
import { getApplicantCounts } from "@/lib/data/applications";
import { getEventsByCreator, getAttendeeCounts } from "@/lib/data/events";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { OpportunityRow } from "@/components/business/OpportunityRow";
import { EventRow } from "@/components/business/EventRow";
import { CreateOrganizationForm } from "@/components/business/CreateOrganizationForm";
import { LocationVisibilityControl } from "@/components/business/LocationVisibilityControl";
import type { OrganizationLocationVisibility } from "@/lib/types";

export default async function BusinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Strict superset of the old owner-only lookup: checks owner_id first
  // (identical result/path to before for a lone owner), then falls back to
  // an active organization_members row. See lib/data/organization.ts.
  const org = await getOrganizationForMember(user.id);

  if (!org) {
    const pendingInvites = await getPendingInvitationsForProfile(user.id);

    return (
      <div className="mx-auto max-w-md space-y-4">
        <div className="text-center">
          <Building2 className="mx-auto h-8 w-8 text-flow-600" />
          <h1 className="mt-2 text-xl font-bold text-ink-900 dark:text-white">Set up your business profile</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Post gigs and jobs, discover talent, and sponsor local events.</p>
        </div>

        {pendingInvites.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
                <Mail className="h-4 w-4" /> Pending invitations
              </h2>
            </CardHeader>
            <CardBody className="space-y-2">
              <p className="text-xs text-ink-400">No email was sent for these — they were added directly by the business owner.</p>
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-xl border border-ink-100 p-3 text-sm dark:border-ink-800">
                  <span className="font-medium text-ink-900 dark:text-white">{invite.organization?.name ?? "A business"}</span>
                  <Badge tone="gold">Invited as {invite.role}</Badge>
                </div>
              ))}
              <p className="text-xs text-ink-400">Ask the business owner to activate your access to get started.</p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody>
            <CreateOrganizationForm />
          </CardBody>
        </Card>
      </div>
    );
  }

  const isOwner = org.owner_id === user.id;

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
        {isOwner && (
          <Button href="/business/post">
            <Plus className="h-4 w-4" /> Post an opportunity
          </Button>
        )}
      </div>

      {isOwner && (
        <Card>
          <CardBody>
            {/* `location_visibility` isn't in lib/database.types.ts yet — the
                migration adding it is drafted but not applied (see
                supabase/migrations/20260820163442_organization_location_privacy.sql).
                Defaults to "hidden" client-side to match the column's own
                DB default, so this never overstates what's actually shown
                publicly before the migration lands. */}
            <LocationVisibilityControl organizationId={org.id} current={(org as { location_visibility?: OrganizationLocationVisibility }).location_visibility ?? "hidden"} />
          </CardBody>
        </Card>
      )}

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
        <Button href="/business/team" variant="outline" className="justify-start">
          <Users className="h-4 w-4" /> Team
        </Button>
        {isOwner && (
          <Button href="/business/events/new" variant="outline" className="justify-start">
            <CalendarDays className="h-4 w-4" /> Host an event
          </Button>
        )}
      </div>

      {!isOwner && (
        <p className="text-xs text-ink-400">
          You have team member access to {org.name}. Posting opportunities and events is limited to the business owner for now.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Your postings</h2>
        {postings.length > 0 ? (
          <div className="space-y-2.5">
            {postings.map((p) => (
              <OpportunityRow key={p.id} opportunity={p} applicantCount={applicantCounts.get(p.id) ?? 0} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No postings yet"
            body={isOwner ? "Post your first gig or job to start reaching FLOW members." : "This business hasn't posted any opportunities yet."}
            action={isOwner ? <Button href="/business/post" size="sm">Post an opportunity</Button> : undefined}
          />
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
          <EmptyState
            title="No events yet"
            body={isOwner ? "Host your first event to bring FLOW members together." : "This business hasn't hosted any events yet."}
            action={isOwner ? <Button href="/business/events/new" size="sm">Host an event</Button> : undefined}
          />
        )}
      </section>
    </div>
  );
}
