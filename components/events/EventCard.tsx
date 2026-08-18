import Link from "next/link";
import Image from "next/image";
import { MapPin, Calendar, Users2 } from "lucide-react";
import type { MockEvent } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function EventCard({ event, className }: { event: MockEvent; className?: string }) {
  const spotsLeft = event.capacity - event.registered;

  return (
    <Link
      href={`/events/${event.id}`}
      className={cn(
        "block overflow-hidden rounded-2xl border border-ink-100 bg-white transition hover:border-flow-300 hover:shadow-card dark:border-ink-800 dark:bg-ink-900",
        className,
      )}
    >
      <div className="relative h-32 w-full bg-flow-gradient">
        <Image src={event.cover_url} alt={event.title} fill className="object-cover opacity-80 mix-blend-overlay" unoptimized />
        <div className="absolute left-3 top-3">
          <Badge tone="neutral" className="bg-white/90 text-ink-900">
            {event.category}
          </Badge>
        </div>
        {event.status === "completed" && (
          <div className="absolute right-3 top-3">
            <Badge tone="neutral" className="bg-white/90 text-ink-700">Past</Badge>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold leading-snug text-ink-900 dark:text-white">{event.title}</h3>
        <div className="mt-2 space-y-1 text-xs text-ink-400">
          <p className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> {formatDateTime(event.starts_at)}
          </p>
          <p className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {event.venue}
          </p>
          <p className="flex items-center gap-1">
            <Users2 className="h-3 w-3" /> {event.registered} going{spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ""}
          </p>
        </div>
        <div className="mt-3 font-bold text-ink-900 dark:text-white">{event.price_cents === 0 ? "Free" : `$${(event.price_cents / 100).toFixed(2)}`}</div>
      </div>
    </Link>
  );
}
