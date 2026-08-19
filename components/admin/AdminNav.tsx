"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Kanban, ListTodo, FileText, ShieldCheck, BadgeCheck, ScrollText, Upload, Download, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/leads", label: "Leads", icon: Users, exact: false },
  { href: "/admin/pipeline", label: "Pipeline", icon: Kanban, exact: false },
  { href: "/admin/tasks", label: "Tasks", icon: ListTodo, exact: false },
  { href: "/admin/templates", label: "Templates", icon: FileText, exact: false },
  { href: "/admin/verification", label: "Verification", icon: ShieldCheck, exact: false },
  { href: "/admin/evidence", label: "Evidence", icon: BadgeCheck, exact: false },
  { href: "/admin/import", label: "Import", icon: Upload, exact: false },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, exact: false },
] as const;

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950">
      <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        <Link href="/dashboard" className="mr-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-200">
          <ArrowLeft className="h-3.5 w-3.5" /> FLOW
        </Link>

        {LINKS.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-flow-600 text-white" : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}

        <a
          href="/admin/export/leads"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          <Download className="h-4 w-4" /> Export
        </a>
        <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium capitalize text-ink-500 dark:bg-ink-800 dark:text-ink-300">{role}</span>
      </div>
    </nav>
  );
}
