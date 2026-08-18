import { ShieldCheck, Clock } from "lucide-react";
import type { Tables } from "@/lib/database.types";

export function SkillsList({ skills }: { skills: (Tables<"profile_skills"> & { skill: Tables<"skills"> })[] }) {
  if (skills.length === 0) {
    return <p className="text-sm text-ink-400">No skills added yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((s) => (
        <span
          key={s.skill_id}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >
          {s.verified ? <ShieldCheck className="h-3.5 w-3.5 text-verified-500" /> : <Clock className="h-3.5 w-3.5 text-ink-300" />}
          {s.skill.name}
        </span>
      ))}
    </div>
  );
}
