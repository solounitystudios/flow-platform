import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/data/profile";
import { getMyConnections, getSuggestedConnections } from "@/lib/data/connections";
import { ConnectionsBrowser } from "@/components/social/ConnectionsBrowser";

export default async function ConnectionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [connections, suggested] = await Promise.all([getMyConnections(user.id), getSuggestedConnections(user.id)]);
  return <ConnectionsBrowser connections={connections} suggested={suggested} />;
}
