"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createOrganizationAction, type ActionState } from "@/lib/actions";

const initialState: ActionState = {};

export function CreateOrganizationForm() {
  const [state, formAction] = useActionState(createOrganizationAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Business name" name="name" placeholder="The Dockside Tavern" required />
      <Textarea label="Description" name="description" placeholder="What does your business do?" rows={3} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" name="city" defaultValue="Buffalo" />
        <Select label="State" name="state" defaultValue="NY">
          <option value="NY">New York</option>
          <option value="OH">Ohio</option>
          <option value="PA">Pennsylvania</option>
          <option value="Other">Other</option>
        </Select>
      </div>
      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      <SubmitButton fullWidth pendingLabel="Creating…">Create business profile</SubmitButton>
    </form>
  );
}
