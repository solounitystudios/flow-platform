"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { withdrawApplicationAction } from "@/lib/actions";
import { formatDateTime, cn } from "@/lib/utils";
import type { MyApplicationRow } from "@/lib/data/applications";

const STATUS_TONE: Record<string, "neutral" | "verified" | "flow" | "danger" | "gold"> = {
  pending: "flow",
  accepted: "verified",
  rejected: "neutral",
  withdrawn: "neutral",
  completed: "gold",
  no_show: "danger",
  cancelled: "danger",
};

export function ApplicationRow({ application }: { application: MyApplicationRow }) {
  const [status, setStatus] = useState(application.status);
  const [pending, startTransition] = useTransition();
  const org = application.opportunity.organization;

  function handleWithdraw() {
    startTransition(async () => {
      const result = await withdrawApplicationAction(application.id);
      if (!result.error) setStatus("withdrawn");
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
        {org && <Image src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(org.name)}`} alt={org.name} fill className="object-cover" unoptimized />}
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/gigs/${application.opportunity_id}`} className="truncate font-semibold text-ink-900 hover:text-flow-600 dark:text-white">
          {application.opportunity.title}
        </Link>
        <p className="truncate text-xs text-ink-400">{org?.name ?? "FLOW Business"}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
          <MapPin className="h-3 w-3" /> {application.opportunity.location_name ?? application.opportunity.city}
          {application.opportunity.starts_at && ` · ${formatDateTime(application.opportunity.starts_at)}`}
        </p>
      </div>
      <div className={cn("flex shrink-0 items-center gap-2", pending && "opacity-50")}>
        <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Badge>
        {status === "pending" && (
          <Button size="sm" variant="ghost" onClick={handleWithdraw} disabled={pending}>
            Withdraw
          </Button>
        )}
      </div>
    </div>
  );
}
