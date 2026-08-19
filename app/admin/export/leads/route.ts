import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSecureAdminOrNull } from "@/lib/admin/auth";
import { toCsv } from "@/lib/admin/csv";

// Route Handlers are not wrapped by app/admin/(secure)/layout.tsx — Next.js
// layouts only apply to the page-rendering tree, not route handlers — so
// this performs its own full AAL2 admin check rather than relying on the
// page layout to have already gated access.
export async function GET(request: Request) {
  const admin = await getSecureAdminOrNull();
  if (!admin) return new NextResponse("Forbidden", { status: 403 });

  const includeArchived = new URL(request.url).searchParams.get("archived") === "include";

  const supabase = await createClient();
  let query = supabase
    .from("business_leads")
    .select(
      "business_name, category, neighborhood, city, region, pipeline_stage, interest_level, general_email, general_phone, website_url, archived, last_contact_at, next_action_at, created_at",
    )
    .order("created_at", { ascending: false });
  if (!includeArchived) query = query.eq("archived", false);

  const { data, error } = await query;

  if (error) {
    console.error("[admin:exportLeads]", error.message);
    return new NextResponse("Something went wrong. Try again.", { status: 500 });
  }

  const columns = [
    "business_name",
    "category",
    "neighborhood",
    "city",
    "region",
    "pipeline_stage",
    "interest_level",
    "general_email",
    "general_phone",
    "website_url",
    "archived",
    "last_contact_at",
    "next_action_at",
    "created_at",
  ] as const;

  // csvCell (from lib/admin/csv) prefixes any formula-triggering leading
  // character (=, +, -, @, tab) with an apostrophe — standard CSV-injection
  // mitigation, since these are opened directly in Excel/Sheets.
  const csv = toCsv(columns, data ?? []);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="flow-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
