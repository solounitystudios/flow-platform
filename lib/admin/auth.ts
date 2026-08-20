import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AdminRole } from "@/lib/admin/constants";
import { deriveAdminAccessState, type AdminAccessState } from "@/lib/authz";

export interface AdminContext {
  userId: string;
  role: AdminRole;
  aal2: boolean;
}

/**
 * The only source of truth for "is this person an admin": the database's
 * is_flow_admin() function, backed by the admins table's active flag — not
 * a hidden nav link, not a client-trusted claim. AAL is read from the
 * current session's JWT via getAuthenticatorAssuranceLevel(), which is the
 * same claim Postgres RLS evaluates via auth.jwt() ->> 'aal', so this
 * never disagrees with what the database will actually enforce.
 *
 * Returns null for anyone who isn't an authenticated, active admin — AAL1
 * is enough to pass this check. Use requireSecureAdmin for the AAL2 gate
 * that every actual admin page/action needs.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isAdmin } = await supabase.rpc("is_flow_admin", { require_aal2: false });
  if (!isAdmin) return null;

  const [{ data: aalData }, { data: adminRow }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.from("admins").select("role").eq("profile_id", user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    role: (adminRow?.role as AdminRole) ?? "admin",
    aal2: aalData?.currentLevel === "aal2",
  };
}

/** app/admin/layout.tsx and app/admin/mfa/page.tsx: any active admin may
 * reach these regardless of AAL — this is the MFA enrollment on-ramp. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  return ctx;
}

/** app/admin/(secure)/layout.tsx and every secure admin Server Action: the
 * actual AAL2 gate. An admin who hasn't verified a second factor yet is
 * sent to enroll/verify, never silently let through. */
export async function requireSecureAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  if (!ctx.aal2) redirect("/admin/mfa");
  return ctx;
}

/** Non-redirecting variant for Route Handlers (e.g. the CSV export), which
 * must return a Response rather than throw a Next.js redirect. */
export async function getSecureAdminOrNull(): Promise<AdminContext | null> {
  const ctx = await getAdminContext();
  return ctx?.aal2 ? ctx : null;
}

export type { AdminAccessState };

/**
 * Purely diagnostic, non-redirecting — powers app/admin/access/page.tsx.
 * Never used as an authorization gate itself (requireAdmin/requireSecureAdmin
 * remain the only real gates, unchanged by this function's existence); this
 * only decides which explanatory copy to show a visitor. Gathers the raw
 * signals (does a user exist, is it an admin, is the session AAL2, is
 * there a verified MFA factor) and hands them to deriveAdminAccessState
 * (lib/authz.ts) — the actual state-selection logic — so that logic is
 * unit-testable without a Supabase client. See
 * tests/security/admin-access-gateway.test.ts.
 */
export async function getAdminAccessState(): Promise<AdminAccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return deriveAdminAccessState({ hasUser: false, isAdmin: false, aal2: false, hasVerifiedMfaFactor: false });

  const ctx = await getAdminContext();
  if (!ctx) return deriveAdminAccessState({ hasUser: true, isAdmin: false, aal2: false, hasVerifiedMfaFactor: false });
  if (ctx.aal2) return deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: true, hasVerifiedMfaFactor: true });

  // data.totp only ever contains verified factors (per @supabase/auth-js's
  // own typing) — same distinction MfaEnrollment.tsx already relies on.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedMfaFactor = (factors?.totp.length ?? 0) > 0;
  return deriveAdminAccessState({ hasUser: true, isAdmin: true, aal2: false, hasVerifiedMfaFactor });
}
