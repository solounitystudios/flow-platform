import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import type { PublicClaimView } from "@/lib/passport/domain";
import { formatDateTime } from "@/lib/utils";

/**
 * Verified claims the member chose to show publicly. A row is present only
 * because it is public, verified, unexpired and standard-sensitivity; it
 * carries no source, evidence or verifier detail (that is behind the
 * explanation link, and the database decides what a stranger may see there).
 */
export function PublicVerifiedClaims({ claims, username }: { claims: PublicClaimView[]; username: string }) {
  if (claims.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {claims.map((claim) => (
        <li key={claim.id} className="flex items-start justify-between gap-3 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
          <div>
            <p className="flex items-center gap-1.5 font-semibold text-ink-900 dark:text-white">
              <BadgeCheck className="h-4 w-4 shrink-0 text-verified-600" /> {claim.title}
            </p>
            <p className="text-xs text-ink-400">
              {claim.effective_at ? formatDateTime(claim.effective_at) : "Date not recorded"}
              {claim.expires_at ? ` · valid until ${formatDateTime(claim.expires_at)}` : ""}
            </p>
          </div>
          <Link href={`/p/${username}/claims/${claim.id}`} className="shrink-0 text-sm font-medium text-flow-600">
            Why?
          </Link>
        </li>
      ))}
    </ul>
  );
}
