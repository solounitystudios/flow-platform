"use client";

import { useState, useTransition } from "react";
import { Plus, ShieldCheck, X, Clock } from "lucide-react";
import { addProfileSkillAction, removeProfileSkillAction } from "@/lib/actions";
import type { Tables } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export function SkillsManager({
  mySkills,
  allSkills,
}: {
  mySkills: (Tables<"profile_skills"> & { skill: Tables<"skills"> })[];
  allSkills: Tables<"skills">[];
}) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const myIds = new Set(mySkills.map((s) => s.skill_id));
  const available = allSkills.filter((s) => !myIds.has(s.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {mySkills.map((s) => (
          <span
            key={s.skill_id}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
          >
            {s.verified ? <ShieldCheck className="h-3.5 w-3.5 text-verified-500" /> : <Clock className="h-3.5 w-3.5 text-ink-300" />}
            {s.skill.name}
            <button
              disabled={pending}
              onClick={() => startTransition(() => removeProfileSkillAction(s.skill_id))}
              className="text-ink-300 hover:text-red-500"
              aria-label={`Remove ${s.skill.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <button
          onClick={() => setPicking((p) => !p)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-500 hover:border-flow-400 hover:text-flow-600 dark:border-ink-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add skill
        </button>
      </div>

      {picking && (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-ink-100 p-3 dark:border-ink-800">
          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button
                key={s.id}
                disabled={pending}
                onClick={() => startTransition(() => addProfileSkillAction(s.id))}
                className={cn("rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600 hover:border-flow-400 hover:text-flow-600 dark:border-ink-700 dark:text-ink-300")}
              >
                {s.name}
              </button>
            ))}
            {available.length === 0 && <p className="text-xs text-ink-400">All skills added.</p>}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-400">Skills get verified automatically once you complete related gigs.</p>
    </div>
  );
}
