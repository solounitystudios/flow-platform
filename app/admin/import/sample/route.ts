import { NextResponse } from "next/server";
import { getSecureAdminOrNull } from "@/lib/admin/auth";
import { SAMPLE_LEAD_CSV } from "@/lib/admin/csv";

// Route Handlers aren't wrapped by app/admin/(secure)/layout.tsx — same
// reasoning as app/admin/export/leads/route.ts. The sample contains no
// real data (a single fabricated example row), but stays behind the same
// AAL2 admin gate as everything else under /admin for consistency.
export async function GET() {
  const admin = await getSecureAdminOrNull();
  if (!admin) return new NextResponse("Forbidden", { status: 403 });

  return new NextResponse(SAMPLE_LEAD_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flow-lead-import-sample.csv"`,
    },
  });
}
