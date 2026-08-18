import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyApplications } from "@/lib/data/applications";
import { ApplicationRow } from "@/components/applications/ApplicationRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const applications = await getMyApplications(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">My Applications</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Every gig and job you&apos;ve applied to, and where it stands.</p>
      </div>

      {applications.length > 0 ? (
        <div className="space-y-2.5">
          {applications.map((a) => (
            <ApplicationRow key={a.id} application={a} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="No applications yet"
          body="Browse open gigs and jobs to get started."
          action={<Button href="/gigs" size="sm">Browse gigs</Button>}
        />
      )}
    </div>
  );
}
