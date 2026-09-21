import { Claim } from "./claim";
import { Evidence } from "./evidence";
import { VerificationRecord } from "./verification";
import { AuthorityAssignment } from "./authority";
import { ConsentGrant, DisclosureResponse } from "./consent";
import { Relationship } from "./relationship";
import { PassportEvent } from "./events";
import { IntegrationConnection } from "./integration";
import { CaptureRequest, CaptureStatusReport, EvidencePackage, EvidencePackageReceipt, EvidenceSummary } from "./capture";
import { GatewayErrorBody } from "./errors";
import { SubjectRef } from "./subject";
import { ClaimExplanation } from "./explanation";

/**
 * Every schema published as JSON Schema. The files under `schemas/` are
 * GENERATED from these zod definitions (see tests/unit/passport-contracts.test.ts,
 * `npm run contracts:schemas`) — never edited by hand — so the TypeScript
 * types, the runtime validators and the JSON Schema a non-TypeScript consumer
 * uses can not diverge.
 */
export const WIRE_SCHEMAS = {
  SubjectRef,
  Claim,
  Evidence,
  VerificationRecord,
  AuthorityAssignment,
  ConsentGrant,
  DisclosureResponse,
  Relationship,
  PassportEvent,
  IntegrationConnection,
  CaptureRequest,
  CaptureStatusReport,
  EvidencePackage,
  EvidencePackageReceipt,
  EvidenceSummary,
  GatewayErrorBody,
  ClaimExplanation,
} as const;
