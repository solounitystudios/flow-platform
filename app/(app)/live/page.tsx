import { getOpenOpportunities } from "@/lib/data/opportunities";
import { LiveBrowser } from "@/components/opportunities/LiveBrowser";

export default async function LivePage() {
  const opportunities = await getOpenOpportunities();
  return <LiveBrowser opportunities={opportunities} />;
}
