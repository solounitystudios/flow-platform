import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/profile";
import { getClaimExplanation, getClaimRow } from "@/lib/passport/data";
import { claimTitle } from "@/lib/passport/domain";
import { ClaimExplanationCard } from "@/components/passport/ClaimExplanationCard";
import { ClaimVisibilityToggle } from "@/components/passport/ClaimVisibilityToggle";
import { Card, CardBody } from "@/components/ui/Card";
import { isUuid } from "@/lib/geo";

/** The signed-in "why does Passport show this?" — the database decides how much of the chain this viewer sees. */
export default async function ClaimExplanationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const explanation = await getClaimExplanation(supabase, id);
  // Indistinguishable from "doesn't exist": the RPC returns not_found to anyone with no right to know.
  if (!explanation) notFound();

  const isOwner = explanation.viewer === "owner";
  const row = await getClaimRow(supabase, id);
  const title = row ? claimTitle(row.claim_type, row.value, isOwner ? "owner" : "public") : "Passport claim";
  const canShare = isOwner && explanation.claim.effective_status === "verified" && explanation.claim.sensitivity === "standard";

  return (
    <div className="space-y-5">
      <Link href={isOwner ? "/passport" : "/dashboard"} className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> {isOwner ? "Back to my Passport" : "Back"}
      </Link>

      <ClaimExplanationCard explanation={explanation} title={title} />

      {isOwner && (
        <Card>
          <CardBody className="space-y-2">
            <h2 className="font-bold text-ink-900 dark:text-white">Who can see this</h2>
            <ClaimVisibilityToggle
              claimId={id}
              initialVisibility={explanation.claim.visibility}
              disabledReason={canShare ? undefined : "Only verified, standard-sensitivity claims can be shared publicly."}
            />
            <p className="text-xs text-ink-400">Sharing puts only the claim itself on your public Passport, and only while your Passport is public. Evidence and reviewer details are never shown to the public.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
