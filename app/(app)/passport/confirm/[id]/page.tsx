import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { getVerificationById } from "@/lib/data/verifications";
import { ConfirmCollaboratorClaim } from "@/components/passport/ConfirmCollaboratorClaim";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

/** Reachable by anyone with the link a claimant shares with a named
 * collaborator (see ConfirmationLinkRow in components/settings/EvidencePanel.tsx).
 *
 * verifications_self_read only lets the claimant or an admin SELECT this
 * row (see supabase/migrations/20260819073354_v1plus_passport_trust_matching.sql
 * and 20260822180043_passport_verification_tiering.sql, which deliberately
 * left that policy alone). A named witness who isn't the claimant is
 * therefore *authorized to confirm* this claim (row-scoped inside
 * confirm_verification_as_collaborator(), a SECURITY DEFINER RPC that
 * bypasses RLS to check witness_profile_id itself) but cannot *read* it
 * through the normal client. To still show a witness real context instead
 * of a bare UUID, the claimant embeds display-only title/type text in the
 * link's query string when they copy it. That text is never trusted for
 * anything security-relevant — it's just what renders before the RPC call
 * confirms who's actually allowed to act. When the viewer *can* read the
 * row directly (the claimant previewing their own link, or an admin), the
 * real row is used instead and the query string is ignored.
 *
 * Flagged for supabase-backend: a future `verifications_witness_read` RLS
 * policy (auth.uid() = witness_profile_id) would let this page — and a
 * "claims waiting on you" list elsewhere — read the real row directly
 * instead of relying on link-embedded context. Not added in this batch;
 * out of scope for the application layer to add RLS itself.
 */
export default async function ConfirmCollaboratorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; type?: string }>;
}) {
  const { id } = await params;
  const { title: linkTitle, type: linkType } = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    const query = new URLSearchParams();
    if (linkTitle) query.set("title", linkTitle);
    if (linkType) query.set("type", linkType);
    const q = query.toString();
    const nextPath = `/passport/confirm/${id}${q ? `?${q}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const claim = await getVerificationById(id);
  const title = claim?.title ?? linkTitle ?? "a Passport claim";
  const typeLabel = linkType || null;
  const claimantName = claim?.profile?.full_name ?? claim?.profile?.username ?? null;
  const isPending = claim ? claim.status === "pending" : true;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader>
          <h1 className="flex items-center gap-2 font-bold text-ink-900 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-flow-600" /> Confirm this claim
          </h1>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {claimantName ? `${claimantName} named you` : "You've been named"} as a collaborator who can vouch for this Passport claim:
          </p>
          <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
            <p className="font-medium text-ink-900 dark:text-white">{title}</p>
            {typeLabel && <p className="text-xs text-ink-400">{typeLabel}</p>}
          </div>

          {!isPending ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">
              This claim isn&apos;t pending anymore{claim ? ` (currently ${claim.status})` : ""} — there&apos;s nothing left to confirm.
            </p>
          ) : (
            <ConfirmCollaboratorClaim verificationId={id} />
          )}

          <p className="text-xs text-ink-400">
            Confirming this tells FLOW you can personally vouch it&apos;s true. If you weren&apos;t named as the collaborator on this specific claim, confirming will fail.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
