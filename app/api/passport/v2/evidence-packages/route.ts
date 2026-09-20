import type { NextRequest } from "next/server";
import { runGatewayRoute } from "@/lib/passport/gateway/next";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return runGatewayRoute({ name: "post_evidence_package" }, request);
}
