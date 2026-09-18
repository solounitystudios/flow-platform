import Link from "next/link";
import { MapPin, Calendar, Users2, Sparkles } from "lucide-react";
import type { MockActivity } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ACTIVITY_TYPE_LABEL: Record<MockActivity["activity_type"], string> = {
  workshop: "Workshop",
  volunteer_shift: "Volunteer shift",
  training: "Training",
  class: "Class",
  networking: "Networking",
  mentoring: "Mentoring",
  creative_session: "Creative session",
  recreational: "Recreational",
  community: "Community",
};

export function ActivityCard({ activity, className }: { activity: MockActivity; className?: string }) {
  const spotsLeft = activity.capacity != null ? activity.capacity - activity.registered : null;

  return (
    <Link
      href={`/activities/${activity.id}`}
      className={cn(
        "block overflow-hidden rounded-2xl border border-ink-100 bg-white p-4 transition hover:border-flow-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone="flow" icon={<Sparkles className="h-3 w-3" />}>
          {ACTIVITY_TYPE_LABEL[activity.activity_type]}
        </Badge>
        {activity.eventTitle && (
          <span className="truncate text-xs text-ink-400">Part of {activity.eventTitle}</span>
        )}
      </div>
      <h3 className="mt-2 font-semibold leading-snug text-ink-900 dark:text-white">{activity.title}</h3>
      <div className="mt-2 space-y-1 text-xs text-ink-400">
        {activity.starts_at && (
          <p className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDateTime(activity.starts_at)}
          </p>
        )}
        <p className="flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {activity.venue ?? activity.city}
        </p>
        {activity.capacity != null && (
          <p className="flex items-center gap-1">
            <Users2 className="h-3 w-3" /> {activity.registered} joined{spotsLeft !== null && spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
