import { Building2, ShieldCheck } from "lucide-react";
import { requireSecureAdmin } from "@/lib/admin/auth";
import { getAdminOrganizations } from "@/lib/data/admin";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";

/**
 * Read-only organizations directory — no moderation action here. Verified
 * status already has its own dedicated decision flow at /admin/verification
 * (decideVerificationCaseAction / decide_verification_case RPC); this page
 * intentionally does not duplicate or shortcut that. orgs_public_read is
 * already `using (true)` (fully public), so no admin-read RLS policy is
 * needed for this query beyond the requireSecureAdmin() gate below.
 */
export default async function AdminOrganizationsPage() {
  // (secure) layout already calls requireSecureAdmin(), but every page and
  // Server Action under this route group re-checks it directly too —
  // defense in depth for page rendering, not reliance on the layout alone.
  await requireSecureAdmin();

  const organizations = await getAdminOrganizations();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Organizations</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {organizations.length} organization{organizations.length === 1 ? "" : "s"}. Read-only directory — decide verification at{" "}
          <span className="font-medium">/admin/verification</span>.
        </p>
      </div>

      {organizations.length === 0 ? (
        <EmptyState icon={<Building2 className="h-8 w-8" />} title="No organizations yet" />
      ) : (
        <Card>
          <CardHeader>
            <p className="text-sm font-medium text-ink-700 dark:text-ink-200">All organizations</p>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400 dark:border-ink-800">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Verified</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-900">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-900 dark:text-white">{org.name}</p>
                      {org.description && <p className="max-w-xs truncate text-xs text-ink-400">{org.description}</p>}
                    </td>
                    <td className="px-4 py-2.5 capitalize text-ink-600 dark:text-ink-300">{org.org_type}</td>
                    <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{org.owner?.full_name ?? org.owner?.username ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-600 dark:text-ink-300">{[org.city, org.state].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-2.5 text-ink-400">{formatDateTime(org.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {org.verified ? (
                        <Badge tone="verified" icon={<ShieldCheck className="h-3 w-3" />}>
                          Verified
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Unverified</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
