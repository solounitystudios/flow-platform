"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Eye, EyeOff, Pause, Play, Trash2 } from "lucide-react";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { createIntentAction, toggleIntentActiveAction, toggleIntentVisibleAction, deleteIntentAction, type IntentActionState } from "@/lib/intent-actions";
import { INTENT_TYPES } from "@/lib/intent-constants";
import type { MemberIntent } from "@/lib/data/intents";

const initialState: IntentActionState = {};

export function IntentManager({ intents }: { intents: MemberIntent[] }) {
  const [showForm, setShowForm] = useState(intents.length === 0);
  const [state, formAction] = useActionState(createIntentAction, initialState);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {intents.map((intent) => (
          <IntentRow key={intent.id} intent={intent} />
        ))}
        {intents.length === 0 && <p className="text-sm text-ink-400">No goals set yet — tell FLOW what you&apos;re trying to do.</p>}
      </ul>

      {showForm ? (
        <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4 dark:border-ink-700">
          <Select label="What are you trying to do?" name="intent_type" required>
            {INTENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Textarea label="Goal (optional)" name="goal" placeholder="A short note on what success looks like" />
          <Input label="Target categories" name="target_categories" hint="Comma-separated, e.g. hospitality, events" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="City" name="location_city" />
            <Input label="State" name="location_state" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Radius (miles)" name="radius_miles" type="number" min={0} />
            <Select label="Remote / in-person" name="remote_preference" defaultValue="either">
              <option value="either">Either</option>
              <option value="remote">Remote only</option>
              <option value="in_person">In-person only</option>
            </Select>
          </div>
          <Input label="Availability" name="availability" placeholder="Weekends, evenings…" />
          <Input label="Expires (optional)" name="expires_at" type="date" />
          <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
            <input type="checkbox" name="visible" defaultChecked className="h-4 w-4 rounded border-ink-300" />
            Visible to other members and the matching engine
          </label>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Saving…">
              <Plus className="h-4 w-4" /> Add goal
            </SubmitButton>
            {intents.length > 0 && (
              <button type="button" onClick={() => setShowForm(false)} className="text-xs text-ink-400 hover:text-ink-600">
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-ink-300 px-3 py-2 text-sm font-medium text-ink-500 hover:border-flow-400 hover:text-flow-600 dark:border-ink-700"
        >
          <Plus className="h-4 w-4" /> Add another goal
        </button>
      )}
    </div>
  );
}

function IntentRow({ intent }: { intent: MemberIntent }) {
  const [pending, startTransition] = useTransition();
  const label = INTENT_TYPES.find((t) => t.value === intent.intent_type)?.label ?? intent.intent_type;

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 p-3 text-sm dark:border-ink-800">
      <div>
        <p className={`font-medium ${intent.active ? "text-ink-900 dark:text-white" : "text-ink-400 line-through"}`}>{label}</p>
        {intent.goal && <p className="text-xs text-ink-400">{intent.goal}</p>}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          title={intent.visible ? "Visible — click to hide" : "Hidden — click to show"}
          onClick={() => startTransition(async () => { await toggleIntentVisibleAction(intent.id, !intent.visible); })}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          {intent.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          disabled={pending}
          title={intent.active ? "Pause" : "Resume"}
          onClick={() => startTransition(async () => { await toggleIntentActiveAction(intent.id, !intent.active); })}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
        >
          {intent.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => { await deleteIntentAction(intent.id); })}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
