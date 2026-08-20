import { CalendarDays } from "lucide-react";
import { requireSecureAdmin } from "@/lib/admin/auth";
import { getAdminEvents } from "@/lib/data/admin";
import { adminSetEventStatusAction } from "@/lib/admin/actions";
import { EVENT_STATUSES } from "@/lib/admin/constants";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ContentStatusSelect } from "@/components/admin/ContentStatusSelect";
import { formatDateTime } from "@/lib/utils";

const STATUS_TONE: Record<string, "neutral" | "flow" | "verified" | "danger"> = {
  draft: "neutral",
  published: "flow",
  completed: "verified",
  cancelled: "danger",
};

type SearchParams = { status?: string };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // (secure) layout already calls requireSecureAdmin(), but every page and
  // Server Action under this route group re-checks it directly too —
  // defense in depth for page rendering, not reliance on the layout alone.
  await requireSecureAdmin();

  const sp = await searchParams;
  const status = sp.status || undefined;
  const events = await getAdminEvents(status);

  const selectClass =
    "rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-flow-500 dark:border-ink-700 dark:bg-ink-900 dark:text-white";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Events</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {events.length} event{events.length === 1 ? "" : "s"}. This view sees every status, including drafts — not just what&apos;s public.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-2" method="get">
        <select name="status" defaultValue={sp.status ?? ""} className={selectClass}>
          <option value="">All statuses</option>
          {EVENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
      </form>

      {events.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-8 w-8" />} title="No events match" body="Try a different status filter." />
      ) : (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium text-ink-700 dark:text-ink-200">All events</p>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Organization</th>
                  <th className="px-4 py-2.5 font-medium">Starts</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Posted</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-900">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-900 dark:text-white">{e.title}</p>
                      {e.featured && <Badge tone="gold">Featured</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{e.organization?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{formatDateTime(e.starts_at)}</td>
                    <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{e.venue ?? `${e.city}, ${e.state}`}</td>
                    <td className="px-4 py-2.5 text-ink-400">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge>
                        <ContentStatusSelect
                          id={e.id}
                          currentStatus={e.status}
                          statuses={EVENT_STATUSES}
                          action={adminSetEventStatusAction}
                          confirmStatuses={["cancelled"]}
                          confirmDescription={() => "This cancels the event — it stops showing to members right away. You can change the status again later if that was a mistake."}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
