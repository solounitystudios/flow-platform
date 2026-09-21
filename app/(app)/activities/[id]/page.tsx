import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Calendar, MapPin, Users2 } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getActivityDetail, getParticipantsForActivity } from "@/lib/data/activities";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { JoinActivityButton } from "@/components/activities/JoinActivityButton";
import { ActivityParticipantRow } from "@/components/activities/ActivityParticipantRow";
import { ActivityStatusControls } from "@/components/activities/ActivityStatusControls";
import { AddToPassportButton } from "@/components/activities/AddToPassportButton";
import { createClient } from "@/lib/supabase/server";
import { getMyClaimIdForActivity } from "@/lib/passport/data";
import { formatDateTime } from "@/lib/utils";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
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

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const activity = await getActivityDetail(id, user?.id ?? null);
  if (!activity) notFound();

  const spotsLeft = activity.capacity != null ? activity.capacity - activity.registered : null;
  const canJoin = activity.status === "published";

  // Only the HOST's "completed" mark makes an outcome claimable; registering or checking in never does.
  const canAddToPassport = Boolean(user) && !activity.isOwner && activity.myParticipation?.status === "completed";
  const existingClaimId = canAddToPassport && user ? await getMyClaimIdForActivity(await createClient(), user.id, activity.id) : null;

  const participants = activity.isOwner ? await getParticipantsForActivity(activity.id) : [];
  const activeParticipants = participants.filter((p) => p.status === "registered" || p.status === "attended");
  const otherParticipants = participants.filter((p) => p.status === "completed" || p.status === "no_show" || p.status === "cancelled");

  return (
    <div className="space-y-5">
      <Link href="/activities" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to activities
      </Link>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Badge tone="flow">{ACTIVITY_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}</Badge>
              <h1 className="mt-2 text-xl font-bold text-ink-900 dark:text-white">{activity.title}</h1>
              {activity.organization && (
                <p className="mt-1 flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400">
                  Hosted by {activity.organization.name}
                  {activity.organization.verified && <BadgeCheck className="h-3.5 w-3.5 text-flow-600" />}
                </p>
              )}
              {activity.eventTitle && <p className="text-sm text-ink-400">Part of {activity.eventTitle}</p>}
            </div>
            {!activity.isOwner && <Badge tone={activity.status === "published" ? "verified" : "neutral"}>{activity.status}</Badge>}
          </div>

          {activity.isOwner && <ActivityStatusControls activityId={activity.id} status={activity.status} />}

          {activity.description && <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{activity.description}</p>}

          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="When"
              value={activity.starts_at ? formatDateTime(activity.starts_at) : "Ongoing / drop-in"}
            />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Where" value={activity.venue ? `${activity.venue}, ${activity.city}` : activity.city} />
            <InfoRow
              icon={<Users2 className="h-4 w-4" />}
              label="Joined"
              value={`${activity.registered} joined${spotsLeft !== null && spotsLeft > 0 ? ` · ${spotsLeft} spots left` : ""}`}
            />
          </div>

          {!activity.isOwner &&
            (canJoin ? (
              <JoinActivityButton activityId={activity.id} initialParticipation={activity.myParticipation} />
            ) : (
              <p className="text-sm text-ink-400">This activity is no longer open to join.</p>
            ))}

          {canAddToPassport && <AddToPassportButton activityId={activity.id} existingClaimId={existingClaimId} />}
        </CardBody>
      </Card>

      {activity.isOwner && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
            <Users2 className="h-4 w-4" /> Participants ({participants.length})
          </h2>

          {participants.length === 0 ? (
            <EmptyState title="No one's joined yet" body="Once people join, they'll show up here." />
          ) : (
            <div className="space-y-2.5">
              {activeParticipants.map((p) => (
                <ActivityParticipantRow key={p.id} row={p} activityId={activity.id} />
              ))}
              {otherParticipants.length > 0 && (
                <>
                  <p className="pt-1 text-xs font-bold uppercase tracking-wide text-ink-400">Completed, no-shows & cancellations</p>
                  {otherParticipants.map((p) => (
                    <ActivityParticipantRow key={p.id} row={p} activityId={activity.id} />
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}
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
