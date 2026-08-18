import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SectionHeading({ title, subtitle, action, href }: { title: string; subtitle?: string; action?: ReactNode; href?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-ink-900 dark:text-white">{title}</h2>
        {subtitle && <p className="text-sm text-ink-400">{subtitle}</p>}
      </div>
      {href ? (
        <Link href={href} className="flex items-center text-sm font-medium text-flow-600 hover:text-flow-700 dark:text-flow-400">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        action
      )}
    </div>
  );
}
