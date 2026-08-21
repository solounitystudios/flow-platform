import Link from "next/link";
import Image from "next/image";
import { MapPin, Clock, Users2, BadgeCheck } from "lucide-react";
import type { MockOpportunity } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { formatCents, relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { formatDistanceLabel, type DistanceInfo } from "@/lib/geo";

const TYPE_LABEL: Record<MockOpportunity["opportunity_type"], string> = {
  gig: "Gig",
  job: "Job",
  project: "Project",
  volunteer: "Volunteer",
};

export function OpportunityCard({
  opportunity,
  className,
  distanceOverride,
}: {
  opportunity: MockOpportunity;
  className?: string;
  /**
   * Map V2 Batch 3: when the browser's one-shot geolocation is available,
   * callers (e.g. LiveBrowser) can pass a true user-relative distance here
   * to override `opportunity.distance_mi` (which is always the fixed
   * city-center basis computed server-side — see lib/data/opportunities.ts).
   * `undefined`/`null` (the default) keeps this card's existing behavior
   * completely unchanged — no caller is required to pass this.
   *
   * Map V2 Batch 4: carries a full `DistanceInfo` (miles + source), not a
   * bare number, so this card can render the same source-aware wording
   * (formatDistanceLabel) LiveMap's pin detail sheet uses — the two
   * surfaces must never disagree about whether a distance is the viewer's
   * real position or a city-center estimate. Omitting this prop falls back
   * to `opportunity.distance_mi` tagged `source: "city-center"`, which is
   * accurate: that field is always computed from the fixed city center,
   * never the viewer's real position (see lib/data/opportunities.ts).
   */
  distanceOverride?: DistanceInfo | null;
}) {
  const spotsLeft = opportunity.slots - opportunity.slots_filled;
  const distance: DistanceInfo = distanceOverride ?? { miles: opportunity.distance_mi, source: "city-center" };

  return (
    <Link
      href={`/gigs/${opportunity.id}`}
      className={cn(
        "block rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-flow-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
            <Image src={opportunity.organization.logo_url} alt={opportunity.organization.name} fill className="object-cover" unoptimized />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-ink-500 dark:text-ink-400 flex items-center gap-1">
              {opportunity.organization.name}
              {opportunity.organization.verified && <BadgeCheck className="h-3 w-3 text-flow-600" />}
            </p>
          </div>
        </div>
        {opportunity.urgent && <Badge tone="urgent">Urgent</Badge>}
      </div>

      <h3 className="mt-2.5 font-semibold leading-snug text-ink-900 dark:text-white">{opportunity.title}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {opportunity.location_name} · {formatDistanceLabel(distance)}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {relativeTime(opportunity.starts_at)}
        </span>
        <span className="flex items-center gap-1">
          <Users2 className="h-3 w-3" /> {spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left` : "Full"}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Badge tone="flow">{TYPE_LABEL[opportunity.opportunity_type]}</Badge>
        <span className="font-bold text-ink-900 dark:text-white">
          {opportunity.pay_cents ? `${formatCents(opportunity.pay_cents)}/hr` : "Volunteer"}
        </span>
      </div>
    </Link>
  );
}
