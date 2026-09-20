import type { NextRequest } from "next/server";
import { parseGatewayClients } from "./config";
import { GATEWAY_ERRORS } from "@flow/passport-contracts";
import { readBodyCapped } from "./body";
import { handleGatewayRequest, type GatewayRoute } from "./gateway";
import { createGatewayServiceClient } from "./service-client";
import { createSupabaseGatewayStore, type GatewayStore } from "./store";

/**
 * Adapter between a Next route handler and the framework-free gateway. The
 * route files stay one-liners; everything testable lives in gateway.ts.
 */
export async function runGatewayRoute(route: GatewayRoute, request: NextRequest): Promise<Response> {
  const config = parseGatewayClients(process.env.PASSPORT_GATEWAY_CLIENTS);
  const serviceClient = createGatewayServiceClient();
  let bodyText = "";
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await readBodyCapped(request);
    if (!body.ok) {
      const meta = GATEWAY_ERRORS.payload_too_large;
      return Response.json(
        { error: { code: "payload_too_large", message: "Request body is too large.", retryable: meta.retryable, correlation_id: null } },
        { status: meta.status, headers: { "cache-control": "no-store" } },
      );
    }
    bodyText = body.text;
  }
  const url = new URL(request.url);

  // Missing/invalid client config OR no service key => 503 not_configured, never a weaker fallback.
  const configured = config.ok && serviceClient !== null;
  const notConfiguredStore: GatewayStore = {
    consumeNonce: async () => false,
    getCaptureRequest: async () => ({ ok: false, reason: "not_configured" }),
    reportStatus: async () => ({ ok: false, reason: "not_configured" }),
    ingestPackage: async () => ({ ok: false, reason: "not_configured" }),
    getEvidenceSummary: async () => ({ ok: false, reason: "not_configured" }),
    recordConnection: async () => {},
  };

  const result = await handleGatewayRequest(
    route,
    { method: request.method, pathWithQuery: url.pathname + url.search, getHeader: (name) => request.headers.get(name), bodyText },
    {
      clients: configured ? config.clients : null,
      store: configured && serviceClient ? createSupabaseGatewayStore(serviceClient) : notConfiguredStore,
      log: (entry) => console.error("[passport-gateway]", JSON.stringify(entry)),
    },
  );

  return Response.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } });
}
