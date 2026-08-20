"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

/**
 * Reusable confirm-before-you-break-something pattern for admin actions
 * that delete/reject/revoke something. Built on top of `Dialog`.
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Remove this organization?"
 *     description="This will permanently remove Acme Co and everything
 *       linked to it — their listings, events, and verification history.
 *       This can't be undone."
 *     confirmLabel="Remove organization"
 *     onConfirm={() => removeOrganizationAction(orgId)}
 *   />
 *
 * `onConfirm` may be sync or async, and may return `{ error: string }`
 * (matching the existing Server Action shape used by e.g.
 * ContentStatusSelect) to keep the dialog open and show an inline error
 * instead of closing — the caller never has to handle try/catch UI itself.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain-English consequence text — what will happen and that it can't be undone. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => Promise<{ error?: string } | void> | { error?: string } | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      const result = await onConfirm();
      if (result && "error" in result && result.error) {
        setError(result.error);
        setPending(false);
        return;
      }
      setPending(false);
      onOpenChange(false);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onOpenChange(false);
      }}
      role="alertdialog"
      title={title}
      hideCloseButton={pending}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === "danger" ? "danger" : "primary"} size="sm" onClick={handleConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === "danger" && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
          </span>
        )}
        {description && <div className="space-y-1 text-sm text-ink-600 dark:text-ink-300">{description}</div>}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Dialog>
  );
}
