import { z } from "zod";
import { CorrelationId } from "./common";

/**
 * Gateway error vocabulary. `retryable` tells a well-behaved client whether
 * re-sending the identical request can ever succeed: transient server
 * trouble yes; a bad schema or a wrong subject no.
 */
export const GATEWAY_ERRORS = {
  invalid_request: { status: 400, retryable: false },
  invalid_schema: { status: 422, retryable: false },
  unsupported_schema_version: { status: 422, retryable: false },
  unauthorized: { status: 401, retryable: false },
  forbidden_scope: { status: 403, retryable: false },
  replayed_request: { status: 409, retryable: false },
  unknown_capture_request: { status: 404, retryable: false },
  unknown_evidence: { status: 404, retryable: false },
  request_expired: { status: 410, retryable: false },
  request_not_open: { status: 409, retryable: false },
  invalid_transition: { status: 409, retryable: false },
  subject_mismatch: { status: 422, retryable: false },
  location_not_permitted: { status: 422, retryable: false },
  operator_not_permitted: { status: 422, retryable: false },
  integrity_mismatch: { status: 422, retryable: false },
  metadata_missing: { status: 422, retryable: false },
  idempotency_conflict: { status: 409, retryable: false },
  payload_too_large: { status: 413, retryable: false },
  rate_limited: { status: 429, retryable: true },
  not_configured: { status: 503, retryable: true },
  internal_error: { status: 500, retryable: true },
} as const;

export type GatewayErrorCode = keyof typeof GATEWAY_ERRORS;
export const GATEWAY_ERROR_CODES = Object.keys(GATEWAY_ERRORS) as GatewayErrorCode[];

export const GatewayErrorBody = z.object({
  error: z.object({
    code: z.enum(GATEWAY_ERROR_CODES as [GatewayErrorCode, ...GatewayErrorCode[]]),
    message: z.string().max(500),
    retryable: z.boolean(),
    correlation_id: CorrelationId.nullable(),
  }),
});
export type GatewayErrorBody = z.infer<typeof GatewayErrorBody>;

/** Scopes a gateway client may be granted. Bounded and named — no wildcard. */
export const GATEWAY_SCOPES = ["capture_requests:read", "capture_requests:report", "evidence_packages:write", "evidence:read"] as const;
export type GatewayScope = (typeof GATEWAY_SCOPES)[number];
