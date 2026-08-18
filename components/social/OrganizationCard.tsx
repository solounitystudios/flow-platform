import Image from "next/image";
import { BadgeCheck, Star } from "lucide-react";
import type { MockOrganization } from "@/lib/types";

export function OrganizationCard({ org }: { org: MockOrganization }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
        <Image src={org.logo_url} alt={org.name} fill className="object-cover" unoptimized />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate font-semibold text-ink-900 dark:text-white">
          {org.name}
          {org.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-flow-600" />}
        </p>
        <p className="truncate text-xs text-ink-400">
          {org.industry} · {org.city}, {org.state}
        </p>
        {org.member_perk && <p className="mt-1 truncate text-xs font-medium text-flow-600">{org.member_perk}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-700 dark:text-ink-200">
        <Star className="h-3.5 w-3.5 fill-gold-500 text-gold-500" /> {org.rating}
      </span>
    </div>
  );
}
