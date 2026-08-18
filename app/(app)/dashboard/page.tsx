import Link from "next/link";
import { Briefcase, ShieldCheck, CalendarDays, Gift, ArrowRight } from "lucide-react";
import { getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { mockActivity, mockEvents, mockOpportunities } from "@/lib/mock/data";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { EventCard } from "@/components/events/EventCard";
import { ActivityItem } from "@/components/social/ActivityItem";
import { StatTile } from "@/components/ui/StatTile";
import { AvailabilityToggle } from "@/components/dashboard/AvailabilityToggle";
import { Card } from "@/components/ui/Card";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const full = user ? await getFullProfile(user.id) : null;
  const firstName = full?.profile.full_name?.split(" ")[0] || "there";

  const urgentOpportunities = mockOpportunities.filter((o) => o.status === "open" && o.urgent).slice(0, 4);
  const upcomingEvents = mockEvents.filter((e) => e.status === "published").slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">Hey, {firstName} 👋</h1>
          <p className="mt-0.5 text-ink-500 dark:text-ink-400">Here&apos;s what&apos;s happening in Buffalo right now.</p>
        </div>
        {full && <AvailabilityToggle initial={full.profile.available_now} />}
      </div>

      {full && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Reliability" value={`${full.passport.reliability_score ?? 100}%`} accent="verified" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
          <StatTile label="Gigs done" value={full.passport.gigs_completed ?? 0} icon={<Briefcase className="h-3.5 w-3.5" />} />
          <StatTile label="FLOW Points" value={full.passport.flow_points ?? 0} accent="gold" icon={<Gift className="h-3.5 w-3.5" />} />
          <StatTile label="Events" value={full.passport.events_attended ?? 0} icon={<CalendarDays className="h-3.5 w-3.5" />} />
        </div>
      )}

      <section className="space-y-4">
        <SectionHeading title="Urgent — near you" subtitle="Opportunities that need someone today" href="/live" />
        <div className="grid gap-3 sm:grid-cols-2">
          {urgentOpportunities.map((o) => (
            <OpportunityCard key={o.id} opportunity={o} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Upcoming events" href="/events" />
        <div className="grid gap-3 sm:grid-cols-3">
          {upcomingEvents.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading title="Activity feed" subtitle="From your connections" />
        <Card>
          <div className="divide-y divide-ink-100 px-4 dark:divide-ink-800">
            {mockActivity.slice(0, 5).map((item) => (
              <ActivityItem key={item.id} item={item} />
            ))}
          </div>
          <Link href="/connections" className="flex items-center justify-center gap-1 border-t border-ink-100 py-3 text-sm font-medium text-flow-600 dark:border-ink-800">
            See more activity <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>
    </div>
  );
}
