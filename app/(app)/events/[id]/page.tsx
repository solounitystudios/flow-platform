import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Calendar, MapPin, Users2 } from "lucide-react";
import { mockEvents } from "@/lib/mock/data";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { RegisterButton } from "@/components/events/RegisterButton";
import { formatDateTime } from "@/lib/utils";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = mockEvents.find((e) => e.id === id);
  if (!event) notFound();

  const spotsLeft = event.capacity - event.registered;
  const isUpcoming = event.status === "published";

  return (
    <div className="space-y-5">
      <Link href="/events" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to events
      </Link>

      <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-flow-gradient sm:h-56">
        <Image src={event.cover_url} alt={event.title} fill className="object-cover opacity-80 mix-blend-overlay" unoptimized />
        <div className="absolute left-4 top-4">
          <Badge tone="neutral" className="bg-white/90 text-ink-900">{event.category}</Badge>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-5">
          <div>
            <h1 className="text-xl font-bold text-ink-900 dark:text-white">{event.title}</h1>
            {event.organization && (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400">
                Hosted by {event.organization.name}
                {event.organization.verified && <BadgeCheck className="h-3.5 w-3.5 text-flow-600" />}
              </p>
            )}
          </div>

          <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{event.description}</p>

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="When" value={formatDateTime(event.starts_at)} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Where" value={`${event.venue}, ${event.city}`} />
            <InfoRow icon={<Users2 className="h-4 w-4" />} label="Capacity" value={`${event.registered} going · ${spotsLeft} spots left`} />
          </div>

          {isUpcoming ? <RegisterButton price_cents={event.price_cents} full /> : <p className="text-sm text-ink-400">This event has already happened.</p>}
        </CardBody>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className="font-medium text-ink-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
