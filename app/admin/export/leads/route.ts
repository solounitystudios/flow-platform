import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSecureAdminOrNull } from "@/lib/admin/auth";

// Route Handlers are not wrapped by app/admin/(secure)/layout.tsx — Next.js
// layouts only apply to the page-rendering tree, not route handlers — so
// this performs its own full AAL2 admin check rather than relying on the
// page layout to have already gated access.
export async function GET() {
  const admin = await getSecureAdminOrNull();
  if (!admin) return new NextResponse("Forbidden", { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_leads")
    .select("business_name, category, neighborhood, city, region, pipeline_stage, interest_level, general_email, general_phone, website_url, last_contact_at, next_action_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin:exportLeads]", error.message);
    return new NextResponse("Something went wrong. Try again.", { status: 500 });
  }

  const columns = ["business_name", "category", "neighborhood", "city", "region", "pipeline_stage", "interest_level", "general_email", "general_phone", "website_url", "last_contact_at", "next_action_at", "created_at"] as const;

  function csvCell(value: unknown) {
    const s = value === null || value === undefined ? "" : String(value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  const rows = (data ?? []).map((row) => columns.map((c) => csvCell(row[c])).join(","));
  const csv = [columns.join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flow-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
