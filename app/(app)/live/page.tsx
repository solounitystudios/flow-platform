import { getOpenOpportunities } from "@/lib/data/opportunities";
import { getUpcomingEvents } from "@/lib/data/events";
import { opportunitiesToMapItems, eventsToMapItems, getBusinessMapItems } from "@/lib/data/discover";
import { LiveBrowser } from "@/components/opportunities/LiveBrowser";

export default async function LivePage() {
  const [opportunities, events] = await Promise.all([getOpenOpportunities(), getUpcomingEvents()]);

  // Businesses layer has no real coordinates to render yet (organizations
  // has no lat/lng column) — getBusinessMapItems() returns [] until
  // schema-auditor's parallel audit lands a schema change for it.
  const mapItems = [...opportunitiesToMapItems(opportunities), ...eventsToMapItems(events), ...getBusinessMapItems()];

  return <LiveBrowser opportunities={opportunities} events={events} mapItems={mapItems} />;
}
