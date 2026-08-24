import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Briefcase, Plus, Users2 } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { getAttendeesForEvent } from "@/lib/data/events";
import { getOpportunitiesForEvent } from "@/lib/data/opportunities";
import { getApplicantCounts } from "@/lib/data/applications";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AttendeeCard } from "@/components/business/AttendeeCard";
import { CheckInForm } from "@/components/business/CheckInForm";
import { OpportunityRow } from "@/components/business/OpportunityRow";
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

  // Batch A (Event Team Builder): staffing opportunities linked to this
  // event, reusing the same opportunity row/applicant-count components and
  // data functions the business dashboard's "Your postings" section uses —
  // no separate event-staffing dashboard.
  const staffing = await getOpportunitiesForEvent(id);
  const applicantCounts = await getApplicantCounts(staffing.map((o) => o.id));

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
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
            <Briefcase className="h-4 w-4" /> Staffing ({staffing.length})
          </h2>
          <Button href={`/business/post?event_id=${id}`} size="sm" variant="outline">
            <Plus className="h-3.5 w-3.5" /> Add role
          </Button>
        </div>

        {staffing.length === 0 ? (
          <EmptyState
            title="No staffing roles yet"
            body="Post a role — bartender, security, DJ, check-in staff — and FLOW workers can apply."
            action={
              <Button href={`/business/post?event_id=${id}`} size="sm">
                Post a staffing role
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {staffing.map((o) => (
              <OpportunityRow key={o.id} opportunity={o} applicantCount={applicantCounts.get(o.id) ?? 0} />
            ))}
          </div>
        )}
      </section>

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
