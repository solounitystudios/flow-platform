"use client";

import { useActionState } from "react";
import { AlertCircle, CalendarDays } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createOpportunityAction, type ActionState } from "@/lib/actions";
import { SKILL_CATEGORIES } from "@/lib/mock/data";
import type { EventLinkCandidate } from "@/lib/data/events";

const initialState: ActionState = {};

export function PostOpportunityForm({
  organizationId,
  eligibleEvents = [],
  linkedEvent = null,
}: {
  organizationId: string;
  /** Same-organization events eligible to link a new staffing opportunity
   * to, for the ordinary /business/post entry point's optional picker. */
  eligibleEvents?: EventLinkCandidate[];
  /** Set when arriving from an event's manage page ("Post a staffing
   * role for this event") — locks the link and pre-fills location fields,
   * per Batch A's "make the relationship visible to the organizer" spec.
   * Server-side validation (FLOW-SEC-002, lib/authz.ts
   * canLinkOpportunityToEvent) is the real enforcement; this is display
   * only. */
  linkedEvent?: EventLinkCandidate | null;
}) {
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
        <Select label="Category" name="category" defaultValue="">
          <option value="">None</option>
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Slots" name="slots" type="number" min={1} defaultValue={1} />
        <Input label="Pay (per hour, $)" name="pay_dollars" type="number" step="0.01" min={0} placeholder="Leave blank for volunteer" />
      </div>

      {linkedEvent ? (
        <div className="flex items-start gap-2 rounded-xl border border-flow-200 bg-flow-50 p-3 text-sm dark:border-flow-800 dark:bg-flow-950/30">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-flow-600" />
          <div>
            <input type="hidden" name="event_id" value={linkedEvent.id} />
            <p className="font-medium text-ink-900 dark:text-white">Staffing role for {linkedEvent.title}</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">{linkedEvent.venue ?? `${linkedEvent.city}, ${linkedEvent.state}`}</p>
          </div>
        </div>
      ) : eligibleEvents.length > 0 ? (
        <Select label="Link to event (optional)" name="event_id" defaultValue="">
          <option value="">Not linked to an event</option>
          {eligibleEvents.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </Select>
      ) : null}

      <Input label="Location name" name="location_name" placeholder="745 Ohio St" defaultValue={linkedEvent?.venue ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" name="city" defaultValue={linkedEvent?.city ?? "Buffalo"} />
        <Select label="State" name="state" defaultValue={linkedEvent?.state ?? "NY"}>
          <option value="NY">New York</option>
          <option value="OH">Ohio</option>
          <option value="PA">Pennsylvania</option>
          <option value="Other">Other</option>
        </Select>
      </div>
      <Input label="Starts at" name="starts_at" type="datetime-local" />

      <div className="space-y-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
        <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input type="checkbox" name="is_remote" className="h-4 w-4 rounded border-ink-300 text-flow-600 focus:ring-flow-500" />
          This can be done remotely
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input type="checkbox" name="instant_book" className="h-4 w-4 rounded border-ink-300 text-flow-600 focus:ring-flow-500" />
          Instant-book — first applicant is auto-accepted, no review needed
        </label>
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
