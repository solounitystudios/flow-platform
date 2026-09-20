import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClaimVisibilityToggle } from "@/components/passport/ClaimVisibilityToggle";
import { claimStatusPresentation } from "@/lib/passport/domain";
import type { OwnerClaimView } from "@/lib/passport/domain";
import { formatDateTime } from "@/lib/utils";

const TONE = { verified: "verified", warning: "gold", neutral: "neutral", danger: "danger" } as const;

/** The owner's canonical Passport claims. Every row links to its own explanation. */
export function VerifiedClaims({ claims }: { claims: OwnerClaimView[] }) {
  if (claims.length === 0) {
    return <EmptyState title="Nothing here yet" body="When an activity host marks you completed, you can add it to your Passport from that activity." />;
  }
  return (
    <ul className="space-y-3">
      {claims.map((claim) => {
        // Same wording the "why" page uses, so the list and its explanation can never disagree.
        const status = claimStatusPresentation(claim.status);
        const canShare = claim.status === "verified" && claim.sensitivity === "standard";
        return (
          <li key={claim.id} className="space-y-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink-900 dark:text-white">{claim.title}</p>
                <p className="text-xs text-ink-400">
                  {claim.effective_at ? `Since ${formatDateTime(claim.effective_at)}` : "Date not recorded"}
                  {claim.expires_at ? ` · until ${formatDateTime(claim.expires_at)}` : ""}
                </p>
              </div>
              <Badge tone={TONE[status.tone]}>{status.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ClaimVisibilityToggle
                claimId={claim.id}
                initialVisibility={claim.visibility}
                disabledReason={canShare ? undefined : "Only verified, standard-sensitivity claims can be shared publicly."}
              />
              <Link href={`/passport/claims/${claim.id}`} className="text-sm font-medium text-flow-600">
                Why is this here?
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
