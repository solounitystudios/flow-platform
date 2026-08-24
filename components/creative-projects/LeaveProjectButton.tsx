"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { leaveCreativeProjectAction } from "@/lib/creative-project-actions";

/** Active non-owner member only — the detail page never renders this for
 * the owner (leave_creative_project() itself rejects role='owner' with
 * owner_cannot_leave, but the button shouldn't be offered in the first
 * place) or for anyone whose status isn't 'active'. History-preserving:
 * the member's row survives as status='removed', visible to them forever
 * via self-read. */
export function LeaveProjectButton({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Leave Project
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${projectTitle}?`}
        description="You'll lose active-member access, including the project-linked evidence flow. Your membership history is preserved, and the owner can invite you again later."
        confirmLabel="Leave Project"
        onConfirm={() => leaveCreativeProjectAction(projectId)}
      />
    </>
  );
}
