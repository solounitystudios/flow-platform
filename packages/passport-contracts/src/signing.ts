import { hmacSha256Hex, hmacSha256Verify, sha256Hex } from "./crypto";

/**
 * Request-signing protocol for service-to-service calls into the Passport
 * Integration Gateway (HMAC-SHA256, version "v1").
 *
 * Signed string, newline-joined:
 *   METHOD \n PATH?QUERY \n TIMESTAMP \n NONCE \n SHA256_HEX(BODY)
 *
 * The signature covers the method, exact path+query, a timestamp (replay
 * window), a single-use nonce (replay ledger, enforced server-side) and the
 * body hash — so none can be altered or replayed on another endpoint. The
 * secret is never sent; `keyId` selects which secret to verify with, which is
 * what makes rotation possible (accept two keys per client during overlap).
 */
export const SIGNATURE_VERSION = "v1";
export const DEFAULT_MAX_SKEW_SECONDS = 300;

export const SIGNING_HEADERS = {
  clientId: "x-flow-client-id",
  keyId: "x-flow-key-id",
  timestamp: "x-flow-timestamp",
  nonce: "x-flow-nonce",
  signature: "x-flow-signature",
} as const;

export type SignedRequestHeaders = {
  "x-flow-client-id": string;
  "x-flow-key-id": string;
  "x-flow-timestamp": string;
  "x-flow-nonce": string;
  "x-flow-signature": string;
};

const NONCE_PATTERN = /^[A-Za-z0-9_\-]{16,64}$/;
const CLIENT_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9_\-]{1,64}$/;

export async function canonicalRequestString(input: { method: string; pathWithQuery: string; timestamp: string; nonce: string; body: string }): Promise<string> {
  return [input.method.toUpperCase(), input.pathWithQuery, input.timestamp, input.nonce, await sha256Hex(input.body)].join("\n");
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signRequest(input: {
  method: string;
  pathWithQuery: string;
  body?: string;
  clientId: string;
  keyId: string;
  secret: string;
  now?: Date;
  nonce?: string;
}): Promise<SignedRequestHeaders> {
  if (!input.secret) throw new Error("signRequest: secret is required");
  const timestamp = String(Math.floor((input.now ?? new Date()).getTime() / 1000));
  const nonce = input.nonce ?? randomNonce();
  const canonical = await canonicalRequestString({ method: input.method, pathWithQuery: input.pathWithQuery, timestamp, nonce, body: input.body ?? "" });
  const signature = `${SIGNATURE_VERSION}=${await hmacSha256Hex(input.secret, canonical)}`;
  return {
    "x-flow-client-id": input.clientId,
    "x-flow-key-id": input.keyId,
    "x-flow-timestamp": timestamp,
    "x-flow-nonce": nonce,
    "x-flow-signature": signature,
  };
}

export type SignatureFailure = "missing_headers" | "malformed_headers" | "timestamp_out_of_window" | "unknown_key" | "bad_signature";

export interface ParsedSignedRequest {
  clientId: string;
  keyId: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

export function parseSigningHeaders(get: (name: string) => string | null): { ok: true; value: ParsedSignedRequest } | { ok: false; code: SignatureFailure } {
  const clientId = get(SIGNING_HEADERS.clientId);
  const keyId = get(SIGNING_HEADERS.keyId);
  const timestamp = get(SIGNING_HEADERS.timestamp);
  const nonce = get(SIGNING_HEADERS.nonce);
  const signature = get(SIGNING_HEADERS.signature);
  if (!clientId || !keyId || !timestamp || !nonce || !signature) return { ok: false, code: "missing_headers" };
  if (!CLIENT_PATTERN.test(clientId) || !KEY_ID_PATTERN.test(keyId) || !NONCE_PATTERN.test(nonce) || !/^\d{9,12}$/.test(timestamp) || !signature.startsWith(`${SIGNATURE_VERSION}=`)) {
    return { ok: false, code: "malformed_headers" };
  }
  return { ok: true, value: { clientId, keyId, timestamp, nonce, signature } };
}

/**
 * Verifies a signed request. `resolveSecret` returns the secret for a
 * (client, key) pair, or null when the pair is unknown/disabled. The caller
 * is still responsible for consuming the nonce (single-use) after this
 * returns ok — signature validity alone does not stop an exact replay.
 */
export async function verifyRequestSignature(input: {
  method: string;
  pathWithQuery: string;
  body: string;
  headers: ParsedSignedRequest;
  resolveSecret: (clientId: string, keyId: string) => string | null | Promise<string | null>;
  now?: Date;
  maxSkewSeconds?: number;
}): Promise<{ ok: true } | { ok: false; code: SignatureFailure }> {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const skew = Math.abs(nowSeconds - Number(input.headers.timestamp));
  if (!Number.isFinite(skew) || skew > (input.maxSkewSeconds ?? DEFAULT_MAX_SKEW_SECONDS)) return { ok: false, code: "timestamp_out_of_window" };

  const secret = await input.resolveSecret(input.headers.clientId, input.headers.keyId);
  if (!secret) return { ok: false, code: "unknown_key" };

  const canonical = await canonicalRequestString({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    timestamp: input.headers.timestamp,
    nonce: input.headers.nonce,
    body: input.body,
  });
  const provided = input.headers.signature.slice(SIGNATURE_VERSION.length + 1);
  const ok = await hmacSha256Verify(secret, canonical, provided);
  return ok ? { ok: true } : { ok: false, code: "bad_signature" };
}
