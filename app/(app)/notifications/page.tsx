import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getNotifications } from "@/lib/data/notifications";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await getNotifications(user.id);
  const hasUnread = notifications.some((n) => !n.read);

  if (notifications.length === 0) {
    return <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" body="Notifications about your applications, gigs, and recommendations will show up here." />;
  }

  return (
    <div className="space-y-3">
      {hasUnread && (
        <div className="flex justify-end">
          <MarkAllReadButton />
        </div>
      )}
      <div className="space-y-2">
        {notifications.map((n) => (
          <NotificationRow key={n.id} notification={n} />
        ))}
      </div>
    </div>
  );
}
