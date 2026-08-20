import { requireAdmin } from "@/lib/admin/auth";

/**
 * The actual admin gate — relocated here (from the old app/admin/layout.tsx)
 * so app/admin/access/page.tsx can sit one level up, outside this group,
 * and stay reachable by a signed-out or non-admin visitor to explain their
 * status rather than bouncing them to /dashboard before they see anything.
 * Every route that used to be directly under app/admin/ (mfa, export,
 * import, (secure)) moved into (gated) unchanged — this is the exact same
 * requireAdmin() call as before, just relocated; the AAL2 gate for the
 * actual secure pages still lives one layer down in
 * app/admin/(gated)/(secure)/layout.tsx, so an AAL1 admin can still reach
 * /admin/mfa to verify.
 */
export default async function AdminGatedLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
