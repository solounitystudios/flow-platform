import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getAdminContext } from "@/lib/admin/auth";
import { MfaEnrollment } from "@/components/admin/MfaEnrollment";

export default async function AdminMfaPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard");
  if (ctx.aal2) redirect("/admin");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-flow-600" />
          <h1 className="text-lg font-semibold text-ink-900 dark:text-white">Verify it&apos;s you</h1>
        </div>
        <p className="mb-5 text-sm text-ink-600 dark:text-ink-300">
          FLOW Admin requires a second factor for every session. This device hasn&apos;t completed that step yet.
        </p>
        <MfaEnrollment />
      </div>
    </div>
  );
}
