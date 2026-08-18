import { redirect } from "next/navigation";
import { getCurrentUser, getFullProfile } from "@/lib/data/profile";
import { Sidebar } from "@/components/nav/Sidebar";
import { BottomNav } from "@/components/nav/BottomNav";
import { TopBar } from "@/components/nav/TopBar";
import { mockNotifications } from "@/lib/mock/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const full = await getFullProfile(user.id);
  const name = full?.profile.full_name || user.email || "FLOW Member";
  const unread = mockNotifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      <Sidebar name={name} avatarUrl={full?.profile.avatar_url} />
      <div className="md:pl-64">
        <TopBar unreadNotifications={unread} />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:px-6 md:pb-10">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
