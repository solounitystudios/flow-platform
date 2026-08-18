import { getOpenOpportunities } from "@/lib/data/opportunities";
import { getUpcomingEvents } from "@/lib/data/events";
import { LiveBrowser } from "@/components/opportunities/LiveBrowser";

export default async function LivePage() {
  const [opportunities, events] = await Promise.all([getOpenOpportunities(), getUpcomingEvents()]);
  return <LiveBrowser opportunities={opportunities} events={events} />;
}
