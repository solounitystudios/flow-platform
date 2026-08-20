import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { SidebarShell, type SidebarNavGroup } from "@/components/nav/SidebarShell";

/**
 * Admin Navigation V2 — grouped sidebar (via the shared SidebarShell), in
 * place of the old horizontal scrolling bar. Only links to pages that
 * actually exist under app/admin/(secure)/** — no placeholder/dead links.
 * Passport, Map, Users, and Settings admin pages don't exist yet, so they're
 * deliberately omitted rather than invented here.
 */
export const ADMIN_NAV_GROUPS: SidebarNavGroup[] = [
  {
    id: "home",
    label: "Home",
    items: [
      { href: "/admin", label: "Overview", icon: "layout-dashboard", exact: true },
      { href: "/admin/command", label: "Command", icon: "radar" },
      { href: "/admin/test-lab", label: "Test Lab", icon: "flask-conical" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    items: [
      { href: "/admin/tasks", label: "Tasks", icon: "list-todo" },
      { href: "/admin/audit", label: "Reports", icon: "scroll-text" },
      { href: "/admin/verification", label: "Verification", icon: "shield-check" },
      { href: "/admin/evidence", label: "Proof & Evidence", icon: "badge-check" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    items: [
      { href: "/admin/leads", label: "Business Prospects", icon: "users" },
      { href: "/admin/pipeline", label: "Outreach Pipeline", icon: "kanban" },
      { href: "/admin/templates", label: "Templates", icon: "file-text" },
      { href: "/admin/import", label: "Import", icon: "upload" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace",
    items: [{ href: "/admin/opportunities", label: "Jobs & Opportunities", icon: "briefcase" }],
  },
  {
    // Deliberately unlabeled — these are single top-level destinations, not
    // a themed group, so a repeated heading above one link would be noise.
    id: "content",
    items: [
      { href: "/admin/events", label: "Events", icon: "calendar-days" },
      { href: "/admin/organizations", label: "Businesses", icon: "building-2" },
    ],
  },
];

export function AdminNav({ role }: { role: string }) {
  return (
    <SidebarShell
      brand={
        <Link href="/admin" className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-white">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-600 text-sm font-bold text-white">F</span>
          FLOW Admin
        </Link>
      }
      mobileTitle={<span className="text-sm font-bold text-ink-900 dark:text-white">FLOW Admin</span>}
      groups={ADMIN_NAV_GROUPS}
      footer={
        <div className="space-y-1 px-2">
          <a
            href="/admin/export/leads"
            className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs font-medium text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
          >
            <Download className="h-4 w-4 shrink-0" /> Export prospects (CSV)
          </a>
          <Link
            href="/dashboard"
            className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-xs font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" /> Back to FLOW
          </Link>
          <span className="mt-1 inline-flex items-center rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium capitalize text-ink-500 dark:bg-ink-800 dark:text-ink-300">
            {role}
          </span>
        </div>
      }
    />
  );
}
