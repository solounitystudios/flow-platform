import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, Calendar, Clock, MapPin, Users2, Zap } from "lucide-react";
import { getOpportunityDetail } from "@/lib/data/opportunities";
import { getCurrentUser } from "@/lib/data/profile";
import { getOpportunityGap } from "@/lib/data/gap";
import { isDemoModeEnabled } from "@/lib/demo";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { ApplyButton } from "@/components/opportunities/ApplyButton";
import { RealApplyButton } from "@/components/opportunities/RealApplyButton";
import { OpportunityGapCard } from "@/components/opportunities/OpportunityGapCard";
import { formatCents, formatDateTime } from "@/lib/utils";

export default async function GigDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const opportunity = await getOpportunityDetail(id, user?.id ?? null);
  if (!opportunity) notFound();

  const spotsLeft = opportunity.slots - opportunity.slots_filled;
  const isOpen = opportunity.status === "open";
  const gap = user && opportunity.source === "real" ? await getOpportunityGap(id, user.id) : null;

  return (
    <div className="space-y-5">
      <Link href="/gigs" className="inline-flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
        <ArrowLeft className="h-4 w-4" /> Back to gigs
      </Link>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-ink-100 dark:bg-ink-800">
                <Image src={opportunity.organization.logo_url} alt={opportunity.organization.name} fill className="object-cover" unoptimized />
              </div>
              <div>
                <p className="flex items-center gap-1 text-sm font-medium text-ink-500 dark:text-ink-400">
                  {opportunity.organization.name}
                  {opportunity.organization.verified && <BadgeCheck className="h-3.5 w-3.5 text-flow-600" />}
                </p>
                <h1 className="text-xl font-bold text-ink-900 dark:text-white">{opportunity.title}</h1>
              </div>
            </div>
            {opportunity.urgent && isOpen && <Badge tone="urgent">Urgent</Badge>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="flow">{opportunity.opportunity_type}</Badge>
            <Badge tone={isOpen ? "verified" : "neutral"}>{opportunity.status}</Badge>
            {opportunity.instantBook && (
              <Badge tone="gold" icon={<Zap className="h-3 w-3" />}>
                Instant book
              </Badge>
            )}
          </div>

          <p className="text-sm leading-relaxed text-ink-600 dark:text-ink-300">{opportunity.description}</p>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={`${opportunity.location_name}`} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Starts" value={formatDateTime(opportunity.starts_at)} />
            <InfoRow icon={<Users2 className="h-4 w-4" />} label="Spots" value={`${spotsLeft} of ${opportunity.slots} open`} />
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Pay" value={opportunity.pay_cents ? `${formatCents(opportunity.pay_cents)}/hr` : "Volunteer"} />
          </div>

          {!isOpen && <p className="text-sm text-ink-400">This opportunity is no longer accepting applicants.</p>}

          {isOpen && opportunity.source === "mock" && isDemoModeEnabled() && <ApplyButton full />}

          {isOpen && opportunity.source === "real" && (
            <RealApplyButton
              opportunityId={opportunity.id}
              isOwner={opportunity.isOwner}
              instantBook={opportunity.instantBook}
              initialStatus={opportunity.myApplicationStatus}
              initialApplicationId={opportunity.myApplicationId}
            />
          )}
        </CardBody>
      </Card>

      {gap && <OpportunityGapCard gap={gap} />}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-ink-100 p-3 dark:border-ink-800">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
        <p className="font-medium text-ink-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
