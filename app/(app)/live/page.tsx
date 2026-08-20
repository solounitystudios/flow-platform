import { getOpenOpportunities } from "@/lib/data/opportunities";
import { getUpcomingEvents } from "@/lib/data/events";
import { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems, getDiscoverOrganizations } from "@/lib/data/discover";
import { LiveBrowser } from "@/components/opportunities/LiveBrowser";

export default async function LivePage() {
  const [opportunities, events, organizations] = await Promise.all([getOpenOpportunities(), getUpcomingEvents(), getDiscoverOrganizations()]);

  // Businesses layer is live — organizations.lat/lng exist — but most orgs
  // won't have coordinates set yet (no geocoding/backfill step exists), so
  // this may still legitimately render zero business pins for a while.
  const mapItems = [...opportunitiesToMapItems(opportunities), ...eventsToMapItems(events), ...organizationsToMapItems(organizations)];

  return <LiveBrowser opportunities={opportunities} events={events} mapItems={mapItems} businessesAvailable />;
}
