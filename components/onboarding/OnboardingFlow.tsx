"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/lib/utils";
import { completeOnboardingAction, type ActionState } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = {};
const STEPS = ["Location", "Skills", "About you"];

export function OnboardingFlow({ fullName, skills }: { fullName: string; skills: Tables<"skills">[] }) {
  const [step, setStep] = useState(0);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [state, formAction] = useActionState(completeOnboardingAction, initialState);

  const grouped = useMemo(() => {
    const map = new Map<string, Tables<"skills">[]>();
    for (const s of skills) {
      const cat = s.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    return Array.from(map.entries());
  }, [skills]);

  function toggleSkill(id: string) {
    setSelectedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= 8 ? prev : [...prev, id]));
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                i < step ? "bg-flow-600 text-white" : i === step ? "bg-flow-600 text-white ring-4 ring-flow-100 dark:ring-flow-950" : "bg-ink-100 text-ink-400 dark:bg-ink-800",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1 rounded", i < step ? "bg-flow-600" : "bg-ink-100 dark:bg-ink-800")} />}
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-ink-100 bg-white p-7 shadow-card dark:border-ink-800 dark:bg-ink-900">
        <p className="text-xs font-bold uppercase tracking-wide text-flow-600">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-white">
          {step === 0 && `Welcome to FLOW, ${fullName.split(" ")[0] || "there"}.`}
          {step === 1 && "What can you do?"}
          {step === 2 && "Add a short bio"}
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {step === 0 && "Tell us where you're based so we can show local opportunities."}
          {step === 1 && "Pick up to 8 skills. You can get them verified later through completed gigs."}
          {step === 2 && "A quick intro helps businesses and connections get to know you."}
        </p>

        <form action={formAction} className="mt-6">
          {selectedSkills.map((id) => (
            <input key={id} type="hidden" name="skills" value={id} />
          ))}

          <div className={cn("space-y-4", step !== 0 && "hidden")}>
            <Input label="City" name="city" defaultValue="Buffalo" required />
            <Select label="State" name="state" defaultValue="NY" required>
              <option value="NY">New York</option>
              <option value="OH">Ohio</option>
              <option value="PA">Pennsylvania</option>
              <option value="MA">Massachusetts</option>
              <option value="Other">Other</option>
            </Select>
          </div>

          <div className={cn("space-y-5", step !== 1 && "hidden")}>
            {grouped.map(([category, items]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">{category}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => {
                    const active = selectedSkills.includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => toggleSkill(s.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                          active
                            ? "border-flow-600 bg-flow-600 text-white"
                            : "border-ink-200 text-ink-600 hover:border-flow-300 dark:border-ink-700 dark:text-ink-300",
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-ink-400">{selectedSkills.length}/8 selected</p>
          </div>

          <div className={cn("space-y-4", step !== 2 && "hidden")}>
            <Textarea label="Bio" name="bio" placeholder="Bartender and event photographer. Always down for a last-minute gig." rows={4} maxLength={280} />
          </div>

          {state.error && (
            <p className="mt-4 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">
              <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
            </p>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="md" onClick={() => setStep((s) => Math.max(0, s - 1))} className={cn(step === 0 && "invisible")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <SubmitButton pendingLabel="Setting up…">Enter FLOW</SubmitButton>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
