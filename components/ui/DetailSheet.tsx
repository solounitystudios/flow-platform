"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Generic compact-preview primitive: "the user tapped something and needs a
 * quick summary plus a link to the full page." Renders as a bottom sheet on
 * mobile (slide up from bottom, dismissible by swipe-down on the drag
 * handle, backdrop tap, Escape, or the close button) and as a small floating
 * card on desktop (no backdrop dim, so the page underneath — e.g. a map —
 * stays interactive).
 *
 * This is deliberately a sibling to `Dialog`, not built on top of it:
 * `Dialog` is a centered, backdrop-blocking modal meant for forms/confirms,
 * while this needs bottom-anchored mobile positioning, a swipe gesture, and
 * a non-blocking floating-card mode on desktop — different enough shape that
 * composing `Dialog` would mean fighting its layout more than reusing it.
 *
 * Domain-agnostic on purpose: no "pin"/"opportunity"/"member" naming.
 * Compose it for a map pin preview, a search result preview, or any other
 * "quick look, then go to the full page" use case.
 *
 * Usage:
 *   <DetailSheet
 *     open={!!activePin}
 *     onClose={() => setActivePin(null)}
 *     icon={<Briefcase className="h-4 w-4" />}
 *     tag={pin.urgent && <Badge tone="urgent">Urgent</Badge>}
 *     title={pin.title}
 *     subtitle={pin.orgName}
 *     meta={[
 *       <span key="loc" className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {pin.locationName}</span>,
 *       <span key="time" className="flex items-center gap-1"><Clock className="h-3 w-3" /> {relativeTime(pin.startsAt)}</span>,
 *     ]}
 *     description={pin.summary}
 *     action={{ label: "View details", href: pin.href }}
 *   />
 */

export interface DetailSheetAction {
  label: string;
  /** Pick one of `href`/`onClick`, same constraint as `Button` (a `Button` rendered with `href` becomes a `next/link` and ignores `onClick`). */
  href?: string;
  onClick?: () => void;
}

export interface DetailSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  /**
   * Small meta items rendered in a wrapping row under the subtitle, each
   * already composed with its own icon/text if needed — e.g.
   * `[<span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> 2.1 mi</span>, "Starts in 2h"]`.
   */
  meta?: ReactNode[];
  /** Optional leading icon/avatar rendered next to the title. */
  icon?: ReactNode;
  /** Optional badge/tag rendered next to the title, e.g. `<Badge tone="urgent">Urgent</Badge>`. */
  tag?: ReactNode;
  /** Longer body copy / description slot. */
  description?: ReactNode;
  /** Primary call to action, right-aligned/full-width button. */
  action?: DetailSheetAction;
  /** Optional secondary action, rendered as an outline button before the primary one. */
  secondaryAction?: DetailSheetAction;
  /** Escape hatch for fully custom body content, rendered after `description`. */
  children?: ReactNode;
  /** Where the floating card anchors on desktop (`sm` and up). Defaults to `bottom-left`. */
  desktopPosition?: "bottom-left" | "bottom-right" | "top-right";
  className?: string;
}

const DESKTOP_POSITION_CLASSES = {
  "bottom-left": "sm:bottom-6 sm:left-6 sm:right-auto sm:top-auto",
  "bottom-right": "sm:bottom-6 sm:right-6 sm:left-auto sm:top-auto",
  "top-right": "sm:top-6 sm:right-6 sm:left-auto sm:bottom-auto",
} as const;

const SWIPE_DISMISS_THRESHOLD_PX = 80;

export function DetailSheet({
  open,
  onClose,
  title,
  subtitle,
  meta,
  icon,
  tag,
  description,
  action,
  secondaryAction,
  children,
  desktopPosition = "bottom-left",
  className,
}: DetailSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Reset any leftover drag state from a previous open/close cycle when this
  // reopens. Adjusted during render (React's documented pattern for this,
  // https://react.dev/learn/you-might-not-need-an-effect) rather than in a
  // useEffect, so it doesn't trigger an extra cascading render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDragY(0);
      setDragging(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
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
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    setDragging(true);
  }

  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  }

  function onHandleTouchEnd() {
    setDragging(false);
    if (dragY > SWIPE_DISMISS_THRESHOLD_PX) {
      onClose();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 sm:pointer-events-none">
      <div className="absolute inset-0 bg-black/40 sm:hidden" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "pointer-events-auto fixed inset-x-0 bottom-0 z-50 max-h-[85vh] animate-slide-up overflow-y-auto rounded-t-3xl border-t border-ink-100 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl outline-none dark:border-ink-800 dark:bg-ink-900",
          "sm:max-h-[70vh] sm:w-full sm:max-w-sm sm:rounded-2xl sm:border sm:pb-5",
          DESKTOP_POSITION_CLASSES[desktopPosition],
          className,
        )}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 200ms ease-out",
        }}
      >
        <div
          role="presentation"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          className="mx-auto -mt-1 mb-3 h-1.5 w-10 shrink-0 rounded-full bg-ink-200 dark:bg-ink-700 sm:hidden"
        />

        <div className="flex items-start gap-3">
          {icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-50 text-flow-700 dark:bg-flow-950 dark:text-flow-300">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 id={titleId} className="line-clamp-2 text-base font-bold leading-snug text-ink-900 dark:text-white">
                {title}
              </h2>
              {tag && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{tag}</div>}
            </div>
            {subtitle && <p className="mt-0.5 line-clamp-2 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {meta && meta.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
            {meta.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {item}
              </span>
            ))}
          </div>
        )}

        {description && <div className="mt-3 text-sm text-ink-600 dark:text-ink-300">{description}</div>}

        {children}

        {(action || secondaryAction) && (
          <div className="mt-4 flex items-center gap-2">
            {secondaryAction && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                href={secondaryAction.href}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
            {action && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                fullWidth={!secondaryAction}
                href={action.href}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
