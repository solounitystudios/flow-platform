import { getOpenOpportunities } from "@/lib/data/opportunities";
import { OpportunityBrowser } from "@/components/opportunities/OpportunityBrowser";

export default async function GigsPage() {
  const opportunities = await getOpenOpportunities();
  return <OpportunityBrowser opportunities={opportunities} />;
}
