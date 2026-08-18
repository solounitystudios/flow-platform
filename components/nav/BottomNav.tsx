"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] dark:border-ink-800 dark:bg-ink-950/95 md:hidden">
      <ul className="flex items-stretch justify-between px-1">
        {PRIMARY_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-flow-600 dark:text-flow-400" : "text-ink-400",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "fill-flow-600/10")} strokeWidth={active ? 2.4 : 2} />
                {item.label === "Live Map" ? "Live" : item.label === "Gigs & Jobs" ? "Gigs" : item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
