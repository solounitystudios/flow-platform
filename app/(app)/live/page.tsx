import { Suspense } from "react";
import { getOpenOpportunities } from "@/lib/data/opportunities";
import { getUpcomingEvents } from "@/lib/data/events";
import { getDiscoverOrganizations } from "@/lib/data/discover";
import { opportunitiesToMapItems, eventsToMapItems, organizationsToMapItems } from "@/lib/map-selectors";
import { LiveBrowser } from "@/components/opportunities/LiveBrowser";

export default async function LivePage() {
  const [opportunities, events, organizations] = await Promise.all([getOpenOpportunities(), getUpcomingEvents(), getDiscoverOrganizations()]);

  // Businesses layer is fully live — organizations_public/location_visibility
  // are applied in production — but most orgs won't have coordinates set yet
  // (no geocoding/backfill step exists), so this may still legitimately
  // render zero business pins for a while.
  const mapItems = [...opportunitiesToMapItems(opportunities), ...eventsToMapItems(events), ...organizationsToMapItems(organizations)];

  // LiveBrowser reads useSearchParams() (Batch 3 — layer + search-area URL
  // persistence, see lib/map-viewport.ts), which per Next.js's own guidance
  // should be wrapped in Suspense. This route is already fully dynamic
  // (lib/supabase/server.ts's createClient() reads cookies()), so this
  // never actually falls back to the Suspense boundary in practice — it's
  // here for correctness against a future static-rendering change, not
  // because this page currently prerenders.
  return (
    <Suspense fallback={<div className="h-[420px] animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-900" />}>
      <LiveBrowser opportunities={opportunities} events={events} organizations={organizations} mapItems={mapItems} />
    </Suspense>
  );
}
