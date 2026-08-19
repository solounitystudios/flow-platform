"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createLeadAction, type AdminActionState } from "@/lib/admin/actions";
import { CONTACT_METHODS } from "@/lib/admin/constants";

const initialState: AdminActionState = {};

export default function NewLeadPage() {
  const [state, formAction] = useActionState(createLeadAction, initialState);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Add a business prospect</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">Publicly available business info only — no scraped personal data.</p>
      </div>

      <form action={formAction} className="space-y-4 rounded-xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" name="business_name" required />
          <Input label="Category" name="category" placeholder="Restaurant, nonprofit, event venue…" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Address" name="address" />
          <Input label="Neighborhood" name="neighborhood" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="City" name="city" defaultValue="Buffalo" />
          <Input label="State" name="region" defaultValue="NY" />
          <Input label="Postal code" name="postal_code" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Website" name="website_url" type="url" />
          <Input label="Social URL" name="social_url" type="url" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="General email" name="general_email" type="email" />
          <Input label="General phone" name="general_phone" type="tel" />
        </div>
        <Textarea label="Staffing problems observed" name="staffing_problems" />
        <Input label="Typical roles" name="typical_roles" hint="Comma-separated, e.g. server, host, dishwasher" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Hiring frequency" name="hiring_frequency" placeholder="Weekly, seasonal…" />
          <Select label="Best contact method" name="best_contact_method">
            <option value="">Unknown</option>
            {CONTACT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Source" name="source" placeholder="Walked by, referral, event…" />
        <Textarea label="Consent notes" name="consent_notes" hint="How/when contact info was gathered and any consent given." />
        <Textarea label="Notes" name="notes" />

        {state.error && (
          <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
            <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
          </p>
        )}

        <SubmitButton pendingLabel="Saving…">Add prospect</SubmitButton>
      </form>
    </div>
  );
}
