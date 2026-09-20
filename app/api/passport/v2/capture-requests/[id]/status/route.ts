import type { NextRequest } from "next/server";
import { runGatewayRoute } from "@/lib/passport/gateway/next";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runGatewayRoute({ name: "report_capture_status", id }, request);
}
