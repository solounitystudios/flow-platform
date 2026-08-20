/**
 * Pure presentational shell for the whole /admin tree — no auth check here
 * on purpose. The actual gate now lives in app/admin/(gated)/layout.tsx,
 * one level deeper, so app/admin/access/page.tsx (a diagnostic page that
 * must work for a signed-out or non-admin visitor too) can sit outside it
 * without ever being redirected away before it renders. Every route that
 * needs real admin access still gets it — see (gated)/layout.tsx.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">{children}</div>;
}
