"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/actions";

export function Sidebar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-100 bg-white px-4 py-6 dark:border-ink-800 dark:bg-ink-950 md:flex">
      <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-flow-gradient text-sm font-black text-white">F</span>
        <span className="text-lg font-black tracking-tight text-ink-900 dark:text-white">FLOW</span>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-flow-50 text-flow-700 dark:bg-flow-950 dark:text-flow-300"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-900 dark:hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-100 p-2 dark:border-ink-800">
        <Avatar src={avatarUrl} name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{name}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" title="Sign out" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </aside>
  );
}
