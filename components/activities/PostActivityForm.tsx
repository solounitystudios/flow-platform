"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createActivityAction, type ActionState } from "@/lib/actions";

const ACTIVITY_TYPES = [
  ["workshop", "Workshop"],
  ["volunteer_shift", "Volunteer shift"],
  ["training", "Training"],
  ["class", "Class"],
  ["networking", "Networking"],
  ["mentoring", "Mentoring"],
  ["creative_session", "Creative session"],
  ["recreational", "Recreational"],
  ["community", "Community"],
] as const;

const initialState: ActionState = {};

/** organizationId is optional — an Activity may stand entirely alone,
 * hosted by an individual with no business/organization at all (a
 * neighborhood cleanup, a free coding workshop). When provided, every
 * created Activity is attributed to that organization automatically, same
 * convention as PostEventForm/PostOpportunityForm — there is no
 * member-level posting right yet, only the organization's own owner ever
 * reaches this form with a non-null organizationId (see
 * app/(app)/activities/new/page.tsx). event_id linking is intentionally
 * not exposed in this form — PR A's approved scope defers "event/org
 * embedding UI beyond the optional relationship" to a later PR; the
 * schema/action already support event_id for when that UI lands. */
export function PostActivityForm({ organizationId, organizationName }: { organizationId: string | null; organizationName: string | null }) {
  const [state, formAction] = useActionState(createActivityAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {organizationId && <input type="hidden" name="organization_id" value={organizationId} />}
      {organizationName && <p className="text-sm text-ink-500 dark:text-ink-400">Hosting as {organizationName}.</p>}
      <Input label="Title" name="title" placeholder="Intro to Cinematography Workshop" required />
      <Textarea label="Description" name="description" placeholder="What will people do? Who should join?" rows={4} />
      <Select label="Activity type" name="activity_type" defaultValue="workshop">
        {ACTIVITY_TYPES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Input label="Venue" name="venue" placeholder="Community Center, Room 2" />
      <Input label="Address" name="address" placeholder="123 Main St" />
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
        <Input label="Ends at" name="ends_at" type="datetime-local" />
      </div>
      <p className="text-xs text-ink-400">Leave the dates blank for an ongoing or drop-in activity with no single fixed occurrence.</p>
      <Input label="Capacity" name="capacity" type="number" min={1} placeholder="Leave blank for unlimited" />

      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      <SubmitButton fullWidth pendingLabel="Publishing…">
        Publish activity
      </SubmitButton>
    </form>
  );
}
