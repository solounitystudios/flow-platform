"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createCreativeProjectAction, type CreativeProjectActionState } from "@/lib/creative-project-actions";

const initialState: CreativeProjectActionState = {};

/** V1 fields only — title and an optional description. No royalty splits,
 * copyright owner, label, release date, or any other speculative field:
 * none of those exist in creative_projects (deliberately, per the Batch 15
 * migration's own "no project lifecycle status column... no consumer of
 * that state exists yet" reasoning), and adding UI for fields the schema
 * doesn't have isn't this batch's call to make. */
export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCreativeProjectAction, initialState);

  return (
    <>
      <Button size="md" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Create Project
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Create a creative project" description="A shared space to invite collaborators to and submit project-linked contribution evidence for.">
        <form action={formAction} className="space-y-3">
          <Input label="Title" name="title" placeholder="e.g. Midnight Sessions EP" required autoFocus />
          <Textarea label="Description (optional)" name="description" placeholder="What is this project?" />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton size="sm" pendingLabel="Creating…">
              Create Project
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
