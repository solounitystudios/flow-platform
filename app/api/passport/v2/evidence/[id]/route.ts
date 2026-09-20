import type { NextRequest } from "next/server";
import { runGatewayRoute } from "@/lib/passport/gateway/next";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runGatewayRoute({ name: "get_evidence", id }, request);
}
