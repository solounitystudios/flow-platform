"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createEventAction, type ActionState } from "@/lib/actions";

const CATEGORIES = [
  "Networking",
  "Career",
  "Hiring",
  "Community",
  "Music",
  "Arts",
  "Technology",
  "Education",
  "Sports/Fitness",
  "Entrepreneurship",
  "Government/Civic",
  "Volunteer",
  "FLOW Official",
];

const initialState: ActionState = {};

export function PostEventForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState(createEventAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="organization_id" value={organizationId} />
      <Input label="Title" name="title" placeholder="Larkin Square Summer Series: Live Music Night" required />
      <Textarea label="Description" name="description" placeholder="What's happening? Who should come?" rows={4} />
      <Select label="Category" name="category" defaultValue="Community">
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
      <Input label="Venue" name="venue" placeholder="Larkin Square" />
      <Input label="Address" name="address" placeholder="745 Seneca St" />
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
        <Input label="Starts at" name="starts_at" type="datetime-local" required />
        <Input label="Ends at" name="ends_at" type="datetime-local" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Capacity" name="capacity" type="number" min={1} placeholder="Leave blank for unlimited" />
        <Input label="Ticket price ($)" name="ticket_price_dollars" type="number" step="0.01" min={0} placeholder="Leave blank for free" />
      </div>

      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      <SubmitButton fullWidth pendingLabel="Publishing…">
        Publish event
      </SubmitButton>
    </form>
  );
}
