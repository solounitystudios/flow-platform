import { getCurrentUser } from "@/lib/data/profile";
import { getDiscoverPeople, getDiscoverOrganizations } from "@/lib/data/discover";
import { DiscoverBrowser } from "@/components/social/DiscoverBrowser";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  const [people, orgs] = await Promise.all([getDiscoverPeople(user?.id), getDiscoverOrganizations()]);
  return <DiscoverBrowser people={people} orgs={orgs} />;
}
