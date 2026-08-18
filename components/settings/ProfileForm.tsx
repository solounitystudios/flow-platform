"use client";

import { useActionState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { updateProfileAction, type ActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = {};

export function ProfileForm({ profile }: { profile: Tables<"profiles"> }) {
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <Input label="Full name" name="full_name" defaultValue={profile.full_name ?? ""} required />
      <Input label="Username" name="username" defaultValue={profile.username ?? ""} hint="Used for your public Passport link." />
      <div className="grid grid-cols-2 gap-3">
        <Input label="City" name="city" defaultValue={profile.city} />
        <Select label="State" name="state" defaultValue={profile.state}>
          <option value="NY">New York</option>
          <option value="OH">Ohio</option>
          <option value="PA">Pennsylvania</option>
          <option value="MA">Massachusetts</option>
          <option value="Other">Other</option>
        </Select>
      </div>
      <Textarea label="Bio" name="bio" defaultValue={profile.bio ?? ""} rows={3} maxLength={280} />
      <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
        <input type="checkbox" name="available_now" defaultChecked={profile.available_now} className="h-4 w-4 rounded border-ink-300 text-flow-600 focus:ring-flow-500" />
        Show as &ldquo;Available now&rdquo; for immediate gigs
      </label>

      {state.error && (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </p>
      )}
      {state.success && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Saved.
        </p>
      )}

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
