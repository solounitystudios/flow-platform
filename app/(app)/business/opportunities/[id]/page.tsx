import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users2 } from "lucide-react";
import { getCurrentUser } from "@/lib/data/profile";
import { createClient } from "@/lib/supabase/server";
import { getApplicantsForOpportunity, getRecommendedRecipientIds } from "@/lib/data/applications";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApplicantCard } from "@/components/business/ApplicantCard";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function ManageOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: opportunity } = await supabase.from("opportunities").select("*").eq("id", id).maybeSingle();
  if (!opportunity) notFound();
  if (opportunity.created_by !== user.id) redirect("/business");

  const [applicants, recommendedIds] = await Promise.all([getApplicantsForOpportunity(id), getRecommendedRecipientIds(id, user.id)]);

  const pending = applicants.filter((a) => a.status === "pending");
  const others = applicants.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-5">
      <Link href="/business" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to business dashboard
      </Link>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-ink-900 dark:text-white">{opportunity.title}</h1>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {opportunity.slots} slot{opportunity.slots === 1 ? "" : "s"} · {opportunity.pay_cents ? `${formatCents(opportunity.pay_cents)}/hr` : "Volunteer"}
                {opportunity.starts_at && ` · ${formatDateTime(opportunity.starts_at)}`}
              </p>
            </div>
            <Badge tone={opportunity.status === "open" ? "verified" : "neutral"}>{opportunity.status}</Badge>
          </div>
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 font-bold text-ink-900 dark:text-white">
          <Users2 className="h-4 w-4" /> Applicants ({applicants.length})
        </h2>

        {applicants.length === 0 ? (
          <EmptyState title="No applicants yet" body="Once someone applies, they'll show up here with their FLOW Passport preview." />
        ) : (
          <div className="space-y-3">
            {pending.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Needs review</p>
                {pending.map((a) => (
                  <ApplicantCard key={a.id} row={a} opportunityId={id} hasRecommendation={recommendedIds.has(a.applicant_id)} />
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="space-y-2.5">
                {pending.length > 0 && <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Other applicants</p>}
                {others.map((a) => (
                  <ApplicantCard key={a.id} row={a} opportunityId={id} hasRecommendation={recommendedIds.has(a.applicant_id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
