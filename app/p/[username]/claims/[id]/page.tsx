import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getClaimExplanation, getClaimRow, getProfileIdByUsername, getPublicClaimById } from "@/lib/passport/data";
import { claimTitle, presentPublicClaim } from "@/lib/passport/domain";
import { ClaimExplanationCard } from "@/components/passport/ClaimExplanationCard";
import { PublicPassportShell } from "@/components/passport/PublicPassportShell";
import { isUuid } from "@/lib/geo";

// A claim's explanation is a share target, not something to index.
export const metadata: Metadata = { title: "Why Passport shows this", robots: { index: false, follow: false } };

/**
 * The public "why does Passport show this?". It works for logged-out viewers:
 * passport_claim_explanation grants anon exactly the public branch (a public,
 * verified, unexpired claim of a public Passport) and answers "not found" for
 * everything else, so no private evidence/verifier detail can reach this page.
 */
export default async function PublicClaimExplanationPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const [profileId, explanation] = await Promise.all([getProfileIdByUsername(supabase, username), getClaimExplanation(supabase, id)]);
  if (!profileId || !explanation) notFound();
  // The URL must be honest: a claim is only ever shown under the Passport it belongs to.
  if (explanation.claim.subject.type !== "person" || explanation.claim.subject.id !== profileId) notFound();

  // The title comes from the allow-listed public projection; only the OWNER may read the canonical row.
  const publicRow = await getPublicClaimById(supabase, id, profileId);
  const ownerRow = !publicRow && explanation.viewer === "owner" ? await getClaimRow(supabase, id) : null;
  const title = publicRow ? presentPublicClaim(publicRow).title : ownerRow ? claimTitle(ownerRow.claim_type, ownerRow.value, "owner") : "Passport claim";

  return (
    <PublicPassportShell>
      <Link href={`/p/${username}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to @{username}&apos;s Passport
      </Link>
      <ClaimExplanationCard explanation={explanation} title={title} />
    </PublicPassportShell>
  );
}
