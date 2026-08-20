import { getUpcomingEvents, getPastEvents } from "@/lib/data/events";
import { EventsBrowser } from "@/components/events/EventsBrowser";

export default async function EventsPage() {
  const [upcoming, past] = await Promise.all([getUpcomingEvents(), getPastEvents()]);
  return <EventsBrowser upcoming={upcoming} past={past} />;
}
