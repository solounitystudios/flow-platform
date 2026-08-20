"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Generic, reusable responsive sidebar/drawer navigation shell.
 *
 * This component carries no FLOW-admin-specific route data — callers pass
 * their own `groups` (see `SidebarNavGroup`/`SidebarNavItem`). It renders:
 *  - a persistent left sidebar on large screens (>= `lg`, 1024px)
 *  - a sticky mobile/tablet top bar with a hamburger trigger + a slide-in
 *    drawer with a backdrop, focus trap, and Escape-to-close, on everything
 *    below `lg` (this deliberately covers iPad portrait *and* landscape,
 *    not just phones — iPad landscape is 1024px, so anything narrower than
 *    that should get the drawer, not a squeezed persistent sidebar)
 *
 * Layout contract for the consumer: the persistent sidebar renders as
 * `fixed inset-y-0 left-0`, so the page's main content wrapper needs a
 * matching left offset at the same breakpoint, e.g.:
 *
 *   <SidebarShell brand={...} groups={...} />
 *   <div className="lg:pl-72"> ...page content... </div>
 *
 * (`lg:pl-72` for the default `width="md"`, `lg:pl-64` for `width="sm"`.)
 */

export interface SidebarNavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  /** Match only the exact href instead of the href-or-prefix default. */
  exact?: boolean;
  /** Optional trailing content, e.g. a count badge. */
  badge?: ReactNode;
}

export interface SidebarNavGroup {
  id: string;
  /** Omit for an ungrouped run of items (no header, always visible). */
  label?: string;
  items: SidebarNavItem[];
  /** Only relevant when `label` is set — whether the group starts expanded. Defaults to true. */
  defaultOpen?: boolean;
}

export interface SidebarShellProps {
  /** Rendered at the top of both the desktop sidebar and the mobile drawer. */
  brand: ReactNode;
  groups: SidebarNavGroup[];
  /** Rendered pinned to the bottom of the sidebar/drawer, e.g. account + sign out. */
  footer?: ReactNode;
  /** Shown in the mobile sticky top bar next to the hamburger; falls back to `brand`. */
  mobileTitle?: ReactNode;
  /** Override the active-item test. Defaults to exact-or-prefix match against the current pathname. */
  isActive?: (item: SidebarNavItem, pathname: string) => boolean;
  width?: "sm" | "md";
  className?: string;
}

const WIDTH_CLASSES = { sm: "w-64", md: "w-72" } as const;

function defaultIsActive(item: SidebarNavItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({
  items,
  pathname,
  isActive,
  onNavigate,
}: {
  items: SidebarNavItem[];
  pathname: string;
  isActive: (item: SidebarNavItem, pathname: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-flow-50 text-flow-700 dark:bg-flow-950 dark:text-flow-300"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-900 dark:hover:text-white",
              )}
            >
              {Icon && <Icon className="h-[18px] w-[18px] shrink-0" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavGroups({
  groups,
  pathname,
  isActive,
  onNavigate,
}: {
  groups: SidebarNavGroup[];
  pathname: string;
  isActive: (item: SidebarNavItem, pathname: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Main">
      {groups.map((group) =>
        group.label ? (
          <details key={group.id} open={group.defaultOpen ?? true} className="group/nav">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-400 [&::-webkit-details-marker]:hidden dark:text-ink-500">
              {group.label}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/nav:rotate-180" />
            </summary>
            <div className="pb-2">
              <NavList items={group.items} pathname={pathname} isActive={isActive} onNavigate={onNavigate} />
            </div>
          </details>
        ) : (
          <div key={group.id}>
            <NavList items={group.items} pathname={pathname} isActive={isActive} onNavigate={onNavigate} />
          </div>
        ),
      )}
    </nav>
  );
}

export function SidebarShell({
  brand,
  groups,
  footer,
  mobileTitle,
  isActive = defaultIsActive,
  width = "md",
  className,
}: SidebarShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const widthClass = WIDTH_CLASSES[width];

  // Close the drawer whenever the route changes (link click, back/forward,
  // etc). Adjusted during render (React's documented pattern for this,
  // https://react.dev/learn/you-might-not-need-an-effect) rather than in a
  // useEffect, so it doesn't trigger an extra cascading render.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const trigger = triggerButtonRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Mobile / tablet sticky top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90 lg:hidden">
        <button
          ref={triggerButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 truncate text-base font-bold text-ink-900 dark:text-white">{mobileTitle ?? brand}</div>
      </div>

      {/* Desktop persistent sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-ink-100 bg-white px-4 py-6 dark:border-ink-800 dark:bg-ink-950 lg:flex",
          widthClass,
          className,
        )}
      >
        <div className="mb-6 px-2">{brand}</div>
        <NavGroups groups={groups} pathname={pathname} isActive={isActive} />
        {footer && <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">{footer}</div>}
      </aside>

      {/* Mobile / tablet drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className={cn(
              "absolute inset-y-0 left-0 flex animate-slide-up flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-ink-950",
              widthClass,
            )}
          >
            <div className="mb-6 flex items-center justify-between gap-3">
              <div className="min-w-0">{brand}</div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavGroups groups={groups} pathname={pathname} isActive={isActive} onNavigate={() => setOpen(false)} />
            {footer && <div className="mt-4 border-t border-ink-100 pt-4 dark:border-ink-800">{footer}</div>}
          </div>
        </div>
      )}
    </>
  );
}
