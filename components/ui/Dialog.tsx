"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free modal primitive (no Radix/Headless UI in this
 * repo — see package.json). Handles the parts that are easy to get wrong:
 * body scroll lock, Escape-to-close, backdrop click, a basic focus trap,
 * and returning focus to whatever triggered the dialog on close.
 *
 * Kept intentionally small — this is the shared base for `ConfirmDialog`.
 * Reach for it directly if a page needs a plain modal (not a confirmation).
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  hideCloseButton?: boolean;
  /** "alertdialog" is more correct for interruptive confirm/destructive prompts. */
  role?: "dialog" | "alertdialog";
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  hideCloseButton,
  role = "dialog",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

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
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

  // `document` doesn't exist during SSR; this component only ever meaningfully
  // renders after a user interaction on the client, so skipping render (rather
  // than mounting via an effect) avoids both the SSR crash and an extra render pass.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role={role}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "relative w-full max-w-md rounded-2xl border border-ink-100 bg-white p-5 shadow-xl outline-none dark:border-ink-800 dark:bg-ink-900",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-bold text-ink-900 dark:text-white">
            {title}
          </h2>
          {!hideCloseButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {description && (
          <p id={descId} className="mt-2 text-sm text-ink-500 dark:text-ink-300">
            {description}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
