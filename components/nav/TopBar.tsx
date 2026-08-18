"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, Menu, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions";

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/live": "Live Opportunities",
  "/gigs": "Gigs & Jobs",
  "/events": "Events",
  "/passport": "FLOW Passport",
  "/discover": "Discover",
  "/connections": "Connections",
  "/rewards": "FLOW Points",
  "/messages": "Messages",
  "/notifications": "Notifications",
  "/business": "Business",
  "/settings": "Settings",
  "/profile": "Profile",
};

export function TopBar({ unreadNotifications = 0 }: { unreadNotifications?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const title = Object.entries(TITLES).find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "FLOW";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-100 bg-white/90 px-4 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90 md:h-16 md:px-8">
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(true)} className="-ml-1 rounded-lg p-2 text-ink-600 dark:text-ink-300 md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold text-ink-900 dark:text-white md:text-lg">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/notifications" className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800">
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-flow-600" />
            )}
          </Link>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-slide-up bg-white p-5 dark:bg-ink-950">
            <div className="mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-flow-gradient text-xs font-black text-white">F</span>
                <span className="text-lg font-black text-ink-900 dark:text-white">FLOW</span>
              </span>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-500" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      active ? "bg-flow-50 text-flow-700 dark:bg-flow-950 dark:text-flow-300" : "text-ink-600 dark:text-ink-300",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <form action={signOutAction} className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">
              <button type="submit" className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
