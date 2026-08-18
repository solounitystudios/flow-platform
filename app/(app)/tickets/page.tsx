import Image from "next/image";
import { Ticket } from "lucide-react";
import { mockTickets } from "@/lib/mock/data";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QrCode } from "@/components/passport/QrCode";
import { formatDateTime } from "@/lib/utils";

const STATUS_TONE = { valid: "verified", used: "neutral", refunded: "danger" } as const;

export default function TicketsPage() {
  if (mockTickets.length === 0) {
    return <EmptyState icon={<Ticket className="h-6 w-6" />} title="No tickets yet" body="Register for an event to see your tickets here." />;
  }

  return (
    <div className="space-y-4">
      {mockTickets.map((t) => (
        <Card key={t.id}>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-flow-gradient">
              <Image src={t.event.cover_url} alt={t.event.title} fill className="object-cover opacity-80 mix-blend-overlay" unoptimized />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-ink-900 dark:text-white">{t.event.title}</p>
                <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{formatDateTime(t.event.starts_at)} · {t.event.venue}</p>
              <p className="mt-1 text-xs text-ink-400">{t.tier} · {t.ticket_code}</p>
            </div>
            <div className="self-center rounded-xl border border-ink-100 bg-white p-1.5 dark:border-ink-800">
              <QrCode value={t.ticket_code} size={64} />
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
