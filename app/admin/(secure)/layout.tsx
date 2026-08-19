import { requireSecureAdmin } from "@/lib/admin/auth";
import { AdminNav } from "@/components/admin/AdminNav";

/**
 * The actual AAL2 gate. Every page and Server Action under this route
 * group also calls requireSecureAdmin() itself — this layout is defense
 * in depth for page rendering, not the only check (Server Actions can be
 * invoked directly and don't run through a page's layout).
 */
export default async function SecureAdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireSecureAdmin();

  return (
    <div>
      <AdminNav role={ctx.role} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
