import {
  CaptureRequest,
  CaptureStatusReport,
  EvidencePackage,
  EvidencePackageReceipt,
  EvidenceSummary,
  GATEWAY_ERRORS,
  PASSPORT_SCHEMA_VERSION,
  computeArtifactsDigest,
  isSchemaVersionSupported,
  type GatewayErrorCode,
  type GatewayScope,
} from "@flow/passport-contracts";
import { payloadFingerprint } from "@/lib/passport/domain";
import { authenticateGatewayRequest } from "./auth";
import type { GatewayClients } from "./config";
import type { GatewayStore } from "./store";

/** Package bodies carry references, never media; 1 MB is generous and bounds abuse. */
export const MAX_BODY_BYTES = 1_000_000;

export type GatewayRoute =
  | { name: "get_capture_request"; id: string }
  | { name: "report_capture_status"; id: string }
  | { name: "post_evidence_package" }
  | { name: "get_evidence"; id: string };

export interface GatewayRequestInput {
  method: string;
  /** path + query exactly as received (this is what the signature covers). */
  pathWithQuery: string;
  getHeader: (name: string) => string | null;
  bodyText: string;
}

export interface GatewayResponse {
  status: number;
  body: unknown;
}

export interface GatewayDeps {
  /** null = not configured: every request answers 503 rather than degrading. */
  clients: GatewayClients | null;
  store: GatewayStore;
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
}

const ROUTE_SCOPE: Record<GatewayRoute["name"], GatewayScope> = {
  get_capture_request: "capture_requests:read",
  report_capture_status: "capture_requests:report",
  post_evidence_package: "evidence_packages:write",
  get_evidence: "evidence:read",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MESSAGES: Partial<Record<GatewayErrorCode, string>> = {
  unknown_capture_request: "No such capture request.",
  unknown_evidence: "No such evidence.",
  request_expired: "This capture request has expired.",
  request_not_open: "This capture request is no longer open.",
  invalid_transition: "That status change is not allowed from the request's current state.",
  subject_mismatch: "The package's subject does not match the capture request.",
  location_not_permitted: "The capture request does not permit location data.",
  operator_not_permitted: "The capture request does not permit operator identity.",
  metadata_missing: "Required source metadata is missing.",
  idempotency_conflict: "This idempotency key or package id was already used with different content.",
  invalid_schema: "The package failed validation.",
  integrity_mismatch: "The artifacts do not match the supplied integrity digest.",
};

function error(code: GatewayErrorCode, message: string, correlationId: string | null): GatewayResponse {
  const meta = GATEWAY_ERRORS[code];
  return { status: meta.status, body: { error: { code, message, retryable: meta.retryable, correlation_id: correlationId } } };
}

/** Business reasons the RPCs return, mapped to public error codes. Anything else is an internal error. */
function fromReason(reason: string, correlationId: string | null): GatewayResponse {
  if (reason in GATEWAY_ERRORS) {
    const code = reason as GatewayErrorCode;
    return error(code, MESSAGES[code] ?? "Request rejected.", correlationId);
  }
  return error("internal_error", "Temporary problem. Retry.", correlationId);
}

/** Which outcomes mean the producer is sending data Passport can't accept (vs a normal business outcome). */
function connectionFailureCategory(code: GatewayErrorCode): "schema" | "rejected" | null {
  switch (code) {
    case "invalid_schema":
    case "unsupported_schema_version":
      return "schema";
    case "integrity_mismatch":
    case "subject_mismatch":
    case "location_not_permitted":
    case "operator_not_permitted":
    case "metadata_missing":
      return "rejected";
    default:
      return null;
  }
}

/** Issue paths only — never echoed values — so a response can't leak submitted content. */
function issuePaths(err: { issues: ReadonlyArray<{ path: PropertyKey[] }> }): string {
  const paths = [...new Set(err.issues.slice(0, 5).map((issue) => issue.path.map(String).join(".") || "(root)"))];
  return `Invalid fields: ${paths.join(", ")}.`;
}

export async function handleGatewayRequest(route: GatewayRoute, input: GatewayRequestInput, deps: GatewayDeps): Promise<GatewayResponse> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  let correlationId: string | null = input.getHeader("x-flow-correlation-id");

  if (!deps.clients) {
    log({ event: "gateway.not_configured" });
    return error("not_configured", "The Passport gateway is not configured.", correlationId);
  }

  if (new TextEncoder().encode(input.bodyText).length > MAX_BODY_BYTES) {
    return error("payload_too_large", "Request body is too large.", correlationId);
  }

  const auth = await authenticateGatewayRequest({
    method: input.method,
    pathWithQuery: input.pathWithQuery,
    body: input.bodyText,
    getHeader: input.getHeader,
    clients: deps.clients,
    consumeNonce: (clientId, nonce) => deps.store.consumeNonce(clientId, nonce),
    now: now(),
  });
  if (!auth.ok) {
    log({ event: "gateway.auth_failed", code: auth.code, detail: auth.detail });
    return error(auth.code, auth.message, correlationId);
  }

  if (!auth.scopes.includes(ROUTE_SCOPE[route.name])) {
    log({ event: "gateway.scope_denied", client: auth.clientId, route: route.name });
    return error("forbidden_scope", "This credential is not permitted to do that.", correlationId);
  }

  const record = async (ok: boolean, category?: string) => {
    try {
      await deps.store.recordConnection(auth.clientId, ok, category);
    } catch (e) {
      // Health bookkeeping must never fail the request itself.
      log({ event: "gateway.record_connection_failed", message: e instanceof Error ? e.message : "unknown" });
    }
  };
  const reject = async (response: GatewayResponse): Promise<GatewayResponse> => {
    const code = (response.body as { error: { code: GatewayErrorCode } }).error.code;
    const category = connectionFailureCategory(code);
    if (category) await record(false, category);
    log({ event: "gateway.rejected", client: auth.clientId, route: route.name, code });
    return response;
  };
  const fail = (code: GatewayErrorCode, message: string) => reject(error(code, message, correlationId));
  const failReason = (reason: string) => reject(fromReason(reason, correlationId));

  try {
    // ── reads ──────────────────────────────────────────────────────────
    if (route.name === "get_capture_request" || route.name === "get_evidence") {
      if (!UUID.test(route.id)) return error("invalid_request", "Malformed id.", correlationId);
      if (route.name === "get_capture_request") {
        const result = await deps.store.getCaptureRequest(route.id);
        if (!result.ok) return await failReason(result.reason);
        const parsed = CaptureRequest.safeParse(result.request);
        if (!parsed.success) {
          log({ event: "gateway.contract_violation", route: route.name, detail: issuePaths(parsed.error) });
          return error("internal_error", "Temporary problem. Retry.", correlationId);
        }
        await record(true);
        return { status: 200, body: parsed.data };
      }
      const result = await deps.store.getEvidenceSummary(auth.clientId, route.id);
      if (!result.ok) return await failReason(result.reason);
      const parsed = EvidenceSummary.safeParse(result.summary);
      if (!parsed.success) {
        log({ event: "gateway.contract_violation", route: route.name, detail: issuePaths(parsed.error) });
        return error("internal_error", "Temporary problem. Retry.", correlationId);
      }
      await record(true);
      return { status: 200, body: parsed.data };
    }

    // ── writes: parse + version + schema ──────────────────────────────
    let raw: unknown;
    try {
      raw = JSON.parse(input.bodyText);
    } catch {
      return error("invalid_request", "Body is not valid JSON.", correlationId);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return error("invalid_request", "Body must be a JSON object.", correlationId);
    const body = raw as Record<string, unknown>;
    if (typeof body.correlation_id === "string") correlationId = body.correlation_id;
    if (!isSchemaVersionSupported(body.schema_version)) {
      return await fail("unsupported_schema_version", `Supported schema major: ${PASSPORT_SCHEMA_VERSION.split(".")[0]}.`);
    }

    if (route.name === "report_capture_status") {
      if (!UUID.test(route.id)) return error("invalid_request", "Malformed id.", correlationId);
      const parsed = CaptureStatusReport.safeParse(body);
      if (!parsed.success) return await fail("invalid_schema", issuePaths(parsed.error));
      if (parsed.data.request_id.toLowerCase() !== route.id.toLowerCase()) return await fail("invalid_schema", "request_id does not match the URL.");
      const fingerprint = await payloadFingerprint({ ...parsed.data, idempotency_key: undefined });
      const result = await deps.store.reportStatus(auth.clientId, parsed.data, fingerprint);
      if (!result.ok) return await failReason(result.reason);
      await record(true);
      return { status: 200, body: { schema_version: PASSPORT_SCHEMA_VERSION, request_id: result.request_id, status: result.status, duplicate: result.duplicate } };
    }

    // post_evidence_package
    const parsed = EvidencePackage.safeParse(body);
    if (!parsed.success) return await fail("invalid_schema", issuePaths(parsed.error));
    const pkg = parsed.data;
    // A client may only deliver packages it itself produced.
    if (pkg.producer !== auth.clientId) {
      log({ event: "gateway.producer_mismatch", client: auth.clientId });
      return error("forbidden_scope", "This credential may not deliver packages for that producer.", correlationId);
    }
    if (pkg.integrity) {
      const digest = await computeArtifactsDigest(pkg.artifacts);
      if (digest !== pkg.integrity.artifacts_digest) return await fail("integrity_mismatch", MESSAGES.integrity_mismatch ?? "Integrity check failed.");
    }
    // The content fingerprint excludes delivery-only fields, so the same package re-sent
    // under a new idempotency key is recognised as the same package.
    const fingerprint = await payloadFingerprint({ ...pkg, idempotency_key: undefined, correlation_id: undefined });
    const result = await deps.store.ingestPackage(auth.clientId, pkg, fingerprint);
    if (!result.ok) return await failReason(result.reason);

    const receipt = EvidencePackageReceipt.safeParse({
      schema_version: PASSPORT_SCHEMA_VERSION,
      package_id: result.package_id,
      evidence_id: result.evidence_id,
      capture_request_id: result.capture_request_id,
      duplicate: result.duplicate,
      // Recording evidence is NOT verification. The receipt says so explicitly.
      evidence_status: "received",
      verification: "none",
      received_at: result.received_at,
    });
    if (!receipt.success) {
      log({ event: "gateway.contract_violation", route: route.name, detail: issuePaths(receipt.error) });
      return error("internal_error", "Temporary problem. Retry.", correlationId);
    }
    await record(true);
    return { status: result.duplicate ? 200 : 201, body: receipt.data };
  } catch (e) {
    // Never swallow: log with context, answer with a retryable, non-revealing error.
    log({ event: "gateway.internal_error", client: auth.clientId, route: route.name, message: e instanceof Error ? e.message : "unknown" });
    return error("internal_error", "Temporary problem. Retry.", correlationId);
  }
}
