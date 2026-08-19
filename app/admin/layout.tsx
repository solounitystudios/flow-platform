import { requireAdmin } from "@/lib/admin/auth";

/**
 * Outer gate for the entire /admin tree, including /admin/mfa. Backed
 * entirely by the database's is_flow_admin() — anyone who isn't an
 * authenticated, active admin never reaches any admin route, regardless
 * of AAL. The AAL2 gate for the actual secure pages lives one layer down,
 * in app/admin/(secure)/layout.tsx, so an AAL1 admin can still reach
 * /admin/mfa to enroll.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">{children}</div>;
}
