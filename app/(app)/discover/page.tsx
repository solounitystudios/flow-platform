import { getCurrentUser } from "@/lib/data/profile";
import { getDiscoverPeople, getDiscoverOrganizations } from "@/lib/data/discover";
import { getConnectionStatuses } from "@/lib/data/connections";
import { isUuid } from "@/lib/geo";
import { DiscoverBrowser } from "@/components/social/DiscoverBrowser";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  const [people, orgs] = await Promise.all([getDiscoverPeople(user?.id), getDiscoverOrganizations()]);

  const realPersonIds = people.map((p) => p.id).filter(isUuid);
  const statuses = user ? await getConnectionStatuses(user.id, realPersonIds) : new Map();
  const statusEntries = Array.from(statuses.entries());

  return <DiscoverBrowser people={people} orgs={orgs} viewerId={user?.id ?? null} statuses={statusEntries} />;
}
