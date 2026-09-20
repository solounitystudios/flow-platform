import { parseSigningHeaders, verifyRequestSignature, type GatewayErrorCode, type GatewayScope, type SignatureFailure } from "@flow/passport-contracts";
import type { GatewayClients } from "./config";

export type GatewayAuthResult =
  | { ok: true; clientId: string; keyId: string; scopes: readonly GatewayScope[] }
  /** `detail` is for SERVER-SIDE LOGS ONLY (e.g. clock skew vs wrong key) — it is never put in a response. */
  | { ok: false; code: GatewayErrorCode; message: string; detail: SignatureFailure | "nonce_store_error" | "nonce_replayed" };

/**
 * Authenticates a service-to-service request: signature over method + path +
 * timestamp + nonce + body hash, then single-use nonce. Every authentication
 * failure is the same 401 "could not be authenticated" — the response never
 * says whether the client id, key id or signature was the wrong part.
 *
 * Order matters: the signature is verified BEFORE the nonce is consumed, so an
 * unauthenticated caller can never fill the nonce ledger.
 */
export async function authenticateGatewayRequest(input: {
  method: string;
  pathWithQuery: string;
  body: string;
  getHeader: (name: string) => string | null;
  clients: GatewayClients;
  consumeNonce: (clientId: string, nonce: string) => Promise<boolean>;
  now?: Date;
}): Promise<GatewayAuthResult> {
  const unauthorized = (detail: SignatureFailure): GatewayAuthResult => ({ ok: false, code: "unauthorized", message: "Request could not be authenticated.", detail });

  const headers = parseSigningHeaders(input.getHeader);
  if (!headers.ok) return unauthorized(headers.code);

  const verified = await verifyRequestSignature({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    body: input.body,
    headers: headers.value,
    resolveSecret: input.clients.resolveSecret,
    now: input.now,
  });
  if (!verified.ok) return unauthorized(verified.code);

  let fresh: boolean;
  try {
    fresh = await input.consumeNonce(headers.value.clientId, headers.value.nonce);
  } catch {
    return { ok: false, code: "internal_error", message: "Temporary problem. Retry.", detail: "nonce_store_error" };
  }
  if (!fresh) return { ok: false, code: "replayed_request", message: "This request was already processed.", detail: "nonce_replayed" };

  return { ok: true, clientId: headers.value.clientId, keyId: headers.value.keyId, scopes: input.clients.scopesFor(headers.value.clientId, headers.value.keyId) };
}
