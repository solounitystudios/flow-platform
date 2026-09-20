import type { NextRequest } from "next/server";
import { runGatewayRoute } from "@/lib/passport/gateway/next";

// Passport Integration Gateway — service-to-service. HMAC-signed requests only
// (see docs/passport/PASSPORT_CAPTURE_CONTRACT.md). Never cached, never static.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return runGatewayRoute({ name: "get_capture_request", id }, request);
}
