import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users2 } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { getAttendeesForEvent } from "@/lib/data/events";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AttendeeCard } from "@/components/business/AttendeeCard";
import { CheckInForm } from "@/components/business/CheckInForm";
import { formatDateTime } from "@/lib/utils";

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();
  if (event.created_by !== user.id) redirect("/business");

  const attendees = await getAttendeesForEvent(id);
  const active = attendees.filter((a) => a.status === "registered" || a.status === "attended");
  const other = attendees.filter((a) => a.status === "no_show" || a.status === "cancelled");

  return (
    <div className="space-y-5">
      <Link href="/business" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to business dashboard
      </Link>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-ink-900 dark:text-white">{event.title}</h1>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {formatDateTime(event.starts_at)} · {event.venue ?? event.city}
              </p>
            </div>
            <Badge tone={event.status === "published" ? "verified" : "neutral"}>{event.status}</Badge>
          </div>
          <CheckInForm eventId={id} />
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
          <Users2 className="h-4 w-4" /> Attendees ({attendees.length})
        </h2>

        {attendees.length === 0 ? (
          <EmptyState title="No one's registered yet" body="Once people grab tickets, they'll show up here." />
        ) : (
          <div className="space-y-2.5">
            {active.map((a) => (
              <AttendeeCard key={a.id} row={a} eventId={id} />
            ))}
            {other.length > 0 && (
              <>
                <p className="pt-1 text-xs font-bold uppercase tracking-wide text-ink-400">No-shows & cancellations</p>
                {other.map((a) => (
                  <AttendeeCard key={a.id} row={a} eventId={id} />
                ))}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
