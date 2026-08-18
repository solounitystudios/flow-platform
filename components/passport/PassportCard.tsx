import Image from "next/image";
import { BadgeCheck, MapPin } from "lucide-react";
import type { PassportData } from "@/lib/passport";
import { formatCents } from "@/lib/utils";
import { cn, initials } from "@/lib/utils";

export function PassportCard({ data, className }: { data: PassportData; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-flow-radial p-6 text-white shadow-glow sm:p-7",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-flow-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-flow-300/20 blur-3xl" />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-1.5 text-flow-200">
          <span className="text-xs font-bold uppercase tracking-[0.2em]">FLOW Passport</span>
        </div>
        {data.availableNow && (
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Available now
          </span>
        )}
      </div>

      <div className="relative mt-5 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/30">
          {data.avatarUrl ? (
            <Image src={data.avatarUrl} alt={data.fullName} fill className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-bold">{initials(data.fullName || "FLOW Member")}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-xl font-bold">{data.fullName || "New FLOW Member"}</h3>
            {data.verified && <BadgeCheck className="h-5 w-5 shrink-0 text-flow-200" />}
          </div>
          {data.username && <p className="text-sm text-flow-200">@{data.username}</p>}
          <p className="mt-0.5 flex items-center gap-1 text-xs text-flow-200/80">
            <MapPin className="h-3 w-3" /> {data.city}, {data.state} · {data.flowId}
          </p>
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        <Stat value={data.gigsCompleted} label="Gigs" />
        <Stat value={data.skillsVerified} label="Skills" />
        <Stat value={data.eventsAttended} label="Events" />
        <Stat value={data.communityProjects} label="Projects" />
        <Stat value={`${data.reliabilityScore}%`} label="Reliable" />
        <Stat value={data.recommendationsCount} label="Recs" />
      </div>

      <div className="relative mt-5 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-flow-200">Earned through FLOW</p>
          <p className="text-lg font-bold">{formatCents(data.earnedCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-flow-200">Member since</p>
          <p className="text-sm font-semibold">
            {new Date(data.memberSince).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-1.5 py-2 text-center backdrop-blur">
      <p className="text-base font-bold leading-none sm:text-lg">{value}</p>
      <p className="mt-1 text-[9.5px] font-medium uppercase tracking-wide text-flow-200 sm:text-[10px]">{label}</p>
    </div>
  );
}
