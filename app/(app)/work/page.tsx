import { redirect } from "next/navigation";
import { Briefcase } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyWork } from "@/lib/data/applications";
import { bucketWork } from "@/lib/work";
import { WorkCard } from "@/components/applications/WorkCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default async function WorkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const work = await getMyWork(user.id);
  // Server Component rendered fresh per request, not memoized like a client
  // component — reading the current time here is intentional, not a purity bug.
  // eslint-disable-next-line react-hooks/purity
  const sections = bucketWork(work, Date.now());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-900 dark:text-white">My Work</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Gigs and jobs you&apos;ve been accepted for.</p>
      </div>

      {work.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="h-6 w-6" />}
          title="No accepted work yet"
          body="Once a business accepts one of your applications, it'll show up here."
          action={<Button href="/gigs" size="sm">Browse gigs</Button>}
        />
      ) : (
        sections.map(
          (section) =>
            section.items.length > 0 && (
              <section key={section.title} className="space-y-3">
                <h2 className="font-bold text-ink-900 dark:text-white">
                  {section.title} <span className="font-normal text-ink-400">({section.items.length})</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {section.items.map((a) => (
                    <WorkCard key={a.id} application={a} />
                  ))}
                </div>
              </section>
            ),
        )
      )}
    </div>
  );
}
