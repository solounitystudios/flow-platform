import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, ShieldAlert, ShieldQuestion, LogIn, KeyRound } from "lucide-react";
import { getAdminAccessState } from "@/lib/admin/auth";
import { isSafeInternalPath } from "@/lib/redirect-safety";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Admin access — FLOW" };

/**
 * Deliberately outside app/admin/(gated)/ — that group's layout calls
 * requireAdmin(), which would bounce a signed-out or non-admin visitor to
 * /dashboard before this page could ever explain their status. This page
 * is diagnostic only: it never grants access itself (getAdminAccessState()
 * is non-redirecting and changes nothing), it just explains the real state
 * requireAdmin()/requireSecureAdmin() would already enforce and points at
 * the correct next step. Safe to visit in any auth state.
 */
export default async function AdminAccessPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const state = await getAdminAccessState();
  const { next: rawNext } = await searchParams;
  const next = isSafeInternalPath(rawNext) ? rawNext : "/admin";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold text-ink-900 dark:text-white">Admin access</h1>
        </CardHeader>
        <CardBody className="space-y-4">
          {state === "signed-out" && (
            <>
              <Status icon={<LogIn className="h-5 w-5" />} tone="neutral" label="Signed out">
                You need to sign in to your FLOW account before this page can check anything else.
              </Status>
              <Button href={`/login?next=${encodeURIComponent(`/admin/access?next=${next}`)}`} fullWidth>
                Sign in
              </Button>
            </>
          )}

          {state === "not-admin" && (
            <Status icon={<ShieldQuestion className="h-5 w-5" />} tone="neutral" label="Not an admin">
              You&apos;re signed in, but this account isn&apos;t a FLOW admin. Admin access is granted directly in the
              database by an existing admin — there&apos;s no self-service way to request it here, and having a second
              factor set up doesn&apos;t change this. If you believe this is wrong, ask an existing FLOW admin to add
              your account.
            </Status>
          )}

          {state === "mfa-not-enrolled" && (
            <>
              <Status icon={<ShieldAlert className="h-5 w-5" />} tone="gold" label="Admin — second factor required">
                You&apos;re a FLOW admin, but this account hasn&apos;t set up a second factor yet. Every admin session
                needs one — it takes about a minute with an authenticator app.
              </Status>
              <Button href={`/admin/mfa?next=${encodeURIComponent(next)}`} fullWidth>
                <KeyRound className="h-4 w-4" /> Set up your second factor
              </Button>
            </>
          )}

          {state === "aal1" && (
            <>
              <Status icon={<ShieldAlert className="h-5 w-5" />} tone="gold" label="Admin — verify this session">
                You&apos;re a FLOW admin and already have a second factor set up, but this specific browser session
                hasn&apos;t completed that check yet — that&apos;s normal on a new device or after signing back in.
              </Status>
              <Button href={`/admin/mfa?next=${encodeURIComponent(next)}`} fullWidth>
                <KeyRound className="h-4 w-4" /> Verify with your authenticator
              </Button>
            </>
          )}

          {state === "aal2" && (
            <>
              <Status icon={<ShieldCheck className="h-5 w-5" />} tone="verified" label="Fully verified">
                You&apos;re signed in as a FLOW admin with a verified second factor. You&apos;re all set.
              </Status>
              <Button href={next} fullWidth>
                Continue to FLOW Admin
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Status({ icon, tone, label, children }: { icon: React.ReactNode; tone: "neutral" | "gold" | "verified"; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-ink-900 dark:text-white">
        {icon}
        <Badge tone={tone}>{label}</Badge>
      </div>
      <p className="text-sm text-ink-600 dark:text-ink-300">{children}</p>
      <Link href="/dashboard" className="inline-block text-xs font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-200">
        Back to FLOW
      </Link>
    </div>
  );
}
