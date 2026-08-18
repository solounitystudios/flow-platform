import Image from "next/image";
import { Ticket } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyTickets } from "@/lib/data/events";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QrCode } from "@/components/passport/QrCode";
import { formatDateTime, dicebearAvatar } from "@/lib/utils";

const STATUS_TONE: Record<string, "verified" | "flow" | "neutral" | "danger"> = {
  registered: "verified",
  attended: "flow",
  no_show: "neutral",
  cancelled: "danger",
};

export default async function TicketsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <EmptyState icon={<Ticket className="h-6 w-6" />} title="Log in to see your tickets" body="Sign in to view tickets for events you've registered for." />;
  }

  const tickets = await getMyTickets(user.id);

  if (tickets.length === 0) {
    return <EmptyState icon={<Ticket className="h-6 w-6" />} title="No tickets yet" body="Register for an event to see your tickets here." />;
  }

  return (
    <div className="space-y-4">
      {tickets.map((t) => (
        <Card key={t.id}>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-flow-gradient">
              <Image src={t.event.image_url ?? dicebearAvatar(t.event.title)} alt={t.event.title} fill className="object-cover opacity-80 mix-blend-overlay" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-ink-900 dark:text-white">{t.event.title}</p>
                <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status.replace("_", " ")}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                {formatDateTime(t.event.starts_at)} · {t.event.venue ?? t.event.city}
              </p>
              <p className="mt-1 text-xs text-ink-400">{t.ticket_type} · {t.checkin_code}</p>
            </div>
            <div className="self-center rounded-xl border border-ink-100 bg-white p-1.5 dark:border-ink-800">
              <QrCode value={t.checkin_code} size={64} />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
