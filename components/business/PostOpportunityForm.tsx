"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createOpportunityAction, type ActionState } from "@/lib/actions";

const initialState: ActionState = {};

export function PostOpportunityForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState(createOpportunityAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <Input label="Title" name="title" placeholder="Two servers needed tonight" required />
      <Textarea label="Description" name="description" placeholder="What does the role involve? Any requirements?" rows={4} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" name="opportunity_type" defaultValue="gig">
          <option value="gig">Gig (one-time)</option>
          <option value="job">Job (ongoing)</option>
          <option value="project">Project</option>
          <option value="volunteer">Volunteer</option>
        </Select>
        <Input label="Slots" name="slots" type="number" min={1} defaultValue={1} />
      </div>
      <Input label="Location name" name="location_name" placeholder="745 Ohio St" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" name="city" defaultValue="Buffalo" />
        <Select label="State" name="state" defaultValue="NY">
          <option value="NY">New York</option>
          <option value="OH">Ohio</option>
          <option value="PA">Pennsylvania</option>
          <option value="Other">Other</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Starts at" name="starts_at" type="datetime-local" />
        <Input label="Pay (per hour, $)" name="pay_dollars" type="number" step="0.01" min={0} placeholder="Leave blank for volunteer" />
      </div>
      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      <SubmitButton fullWidth pendingLabel="Posting…">Post opportunity</SubmitButton>
    </form>
  );
}
