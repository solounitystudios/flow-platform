import type { MockOpportunity } from "@/lib/types";

export interface OpportunityFilters {
  query?: string;
  type?: "gig" | "job" | "project" | "volunteer";
  category?: string;
  remote?: boolean;
  urgentOnly?: boolean;
  maxPayCents?: number;
  verifiedOnly?: boolean;
}

export function filterOpportunities(opportunities: MockOpportunity[], filters: OpportunityFilters) {
  return opportunities.filter((o) => {
    if (filters.type && o.opportunity_type !== filters.type) return false;
    if (filters.category && o.category !== filters.category) return false;
    if (filters.remote && !o.is_remote) return false;
    if (filters.urgentOnly && !o.urgent) return false;
    if (filters.verifiedOnly && !o.organization.verified) return false;
    if (filters.maxPayCents !== undefined && o.pay_cents !== null && o.pay_cents > filters.maxPayCents) return false;
    if (filters.query) {
      const haystack = `${o.title} ${o.description} ${o.organization.name}`.toLowerCase();
      if (!haystack.includes(filters.query.toLowerCase())) return false;
    }
    return true;
  });
}
