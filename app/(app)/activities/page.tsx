import { Plus, Sparkles } from "lucide-react";
import { getUpcomingActivities } from "@/lib/data/activities";
import { ActivityCard } from "@/components/activities/ActivityCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ActivitiesPage() {
  const activities = await getUpcomingActivities();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900 dark:text-white">Activities</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">Workshops, volunteer shifts, training, and community sessions.</p>
        </div>
        <Button href="/activities/new">
          <Plus className="h-4 w-4" /> Host an activity
        </Button>
      </div>

      {activities.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((a) => (
            <ActivityCard key={a.id} activity={a} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="No activities yet"
          body="Be the first to host a workshop, volunteer shift, or community session."
          action={<Button href="/activities/new" size="sm">Host an activity</Button>}
        />
      )}
    </div>
  );
}
