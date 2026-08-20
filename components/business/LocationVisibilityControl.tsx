"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Select } from "@/components/ui/Input";
import { setOrganizationLocationVisibilityAction } from "@/lib/actions";
import type { OrganizationLocationVisibility } from "@/lib/types";

const OPTIONS: { value: OrganizationLocationVisibility; label: string; hint: string }[] = [
  { value: "hidden", label: "Hidden", hint: "No map pin. Recommended if your coordinates are a home address." },
  { value: "approximate", label: "Approximate", hint: "Shows roughly your neighborhood, not an exact point." },
  { value: "exact", label: "Exact", hint: "Shows your business's precise location on the map." },
  { value: "remote", label: "Remote", hint: "No physical location — your page will say \"Remote\"." },
];

/**
 * Owner-only. Never edits lat/lng itself — only how much of it is shown
 * publicly. Defaults to "hidden" server-side (see
 * supabase/migrations/20260820163442_organization_location_privacy.sql),
 * so a business that's never touched this control is never surfaced on
 * the map even if it happens to have coordinates.
 */
export function LocationVisibilityControl({ organizationId, current }: { organizationId: string; current: OrganizationLocationVisibility }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);

  function handleChange(next: OrganizationLocationVisibility) {
    setValue(next);
    setFeedback(null);
    startTransition(async () => {
      const result = await setOrganizationLocationVisibilityAction(organizationId, next);
      setFeedback(result.error ? "error" : "saved");
    });
  }

  const activeHint = OPTIONS.find((o) => o.value === value)?.hint;

  return (
    <div className="space-y-1.5">
      <Select label="Map visibility" value={value} disabled={pending} onChange={(e) => handleChange(e.target.value as OrganizationLocationVisibility)}>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {activeHint && <p className="text-xs text-ink-400">{activeHint}</p>}
      {feedback === "saved" && (
        <p className="flex items-center gap-1 text-xs text-verified-600 dark:text-verified-400">
          <CheckCircle2 className="h-3 w-3" /> Saved.
        </p>
      )}
      {feedback === "error" && (
        <p className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" /> Couldn&apos;t save. Try again.
        </p>
      )}
    </div>
  );
}
