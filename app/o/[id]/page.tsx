import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, MapPin, Globe2 } from "lucide-react";
import Image from "next/image";
import { getPublicOrganization } from "@/lib/data/discover";
import { getOpportunitiesByOrganizationPublic } from "@/lib/data/opportunities";
import { getEventsByOrganizationPublic } from "@/lib/data/events";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const org = await getPublicOrganization(id);
  return { title: org ? `${org.name} — FLOW` : "Business not found — FLOW" };
}

/**
 * Public organization destination. Only ever reads through
 * getPublicOrganization/getOpportunitiesByOrganizationPublic/
 * getEventsByOrganizationPublic — none of which expose the team roster,
 * owner identity, private address, or hidden coordinates (see
 * lib/data/discover.ts's organizations_public view). This is the route
 * Map V2 business pins link to (lib/map-selectors.ts's
 * organizationsToMapItems).
 */
export default async function PublicOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await getPublicOrganization(id);
  if (!org) notFound();

  const [opportunities, events] = await Promise.all([getOpportunitiesByOrganizationPublic(id), getEventsByOrganizationPublic(id)]);

  const locationLabel =
    org.location_visibility === "remote"
      ? "Remote"
      : [org.city, org.state].filter(Boolean).join(", ") || null;

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
              <Image src={org.logo_url} alt={org.name} fill className="object-cover" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-1.5 truncate text-lg font-bold text-ink-900 dark:text-white">
                {org.name}
                {org.verified && <BadgeCheck className="h-4 w-4 shrink-0 text-flow-600" />}
              </h1>
              <p className="text-xs text-ink-400">{org.industry}</p>
            </div>
          </div>

          {org.description && <p className="text-sm text-ink-600 dark:text-ink-300">{org.description}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {org.verified && <Badge tone="verified">Verified business</Badge>}
            {locationLabel && (
              <span className="flex items-center gap-1 text-xs text-ink-400">
                {org.location_visibility === "remote" ? <Globe2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                {locationLabel}
              </span>
            )}
            {org.member_perk && <Badge tone="gold">{org.member_perk}</Badge>}
          </div>
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Open opportunities</h2>
        {opportunities.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {opportunities.map((o) => (
              <OpportunityCard key={o.id} opportunity={o} />
            ))}
          </div>
        ) : (
          <EmptyState title="No open opportunities right now" />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold text-ink-900 dark:text-white">Upcoming events</h2>
        {events.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        ) : (
          <EmptyState title="No upcoming events" />
        )}
      </section>
    </div>
  );
}
