import { z } from "zod";
import { IsoTimestamp, Uuid } from "./common";
import { SubjectRef } from "./subject";

/** Why data is being requested. Consent is purpose-bound, never blanket. */
export const CONSENT_PURPOSES = [
  "hiring_review",
  "credential_check",
  "event_entry",
  "program_enrollment",
  "capture_request",
  "mentorship",
] as const;
export const ConsentPurpose = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

/**
 * Categories of Passport data a grant can cover. `evidence_artifacts`,
 * `contact` and `location` are SENSITIVE categories: they must be requested
 * and approved explicitly, and no purpose bundles them implicitly.
 */
export const DATA_CATEGORIES = [
  "credentials",
  "skills",
  "work_history",
  "attendance",
  "reliability",
  "recommendations",
  "identity_attributes",
  "evidence_artifacts",
  "contact",
  "location",
] as const;
export const DataCategory = z.enum(DATA_CATEGORIES);
export type DataCategory = z.infer<typeof DataCategory>;
export const SENSITIVE_DATA_CATEGORIES: ReadonlyArray<DataCategory> = ["evidence_artifacts", "contact", "location"];

export const CONSENT_STATUSES = ["requested", "active", "declined", "revoked", "expired", "withdrawn"] as const;
export const ConsentStatus = z.enum(CONSENT_STATUSES);
export type ConsentStatus = z.infer<typeof ConsentStatus>;

export const ConsentGrant = z.object({
  id: Uuid,
  /** Who controls the data and decides. */
  grantor: SubjectRef,
  /** Who receives access (an entity, acting through an authorized principal). */
  grantee: SubjectRef,
  /** Whose Passport data the grant is about (usually the grantor). */
  subject: SubjectRef,
  purpose: ConsentPurpose,
  requested_categories: z.array(DataCategory).min(1).max(DATA_CATEGORIES.length),
  approved_categories: z.array(DataCategory).max(DATA_CATEGORIES.length),
  /** Optional context the request is about (an opportunity, an event...). */
  context: z.object({ type: z.string().min(1).max(32), id: Uuid }).nullable(),
  status: ConsentStatus,
  requested_at: IsoTimestamp,
  decided_at: IsoTimestamp.nullable(),
  expires_at: IsoTimestamp.nullable(),
  revoked_at: IsoTimestamp.nullable(),
});
export type ConsentGrant = z.infer<typeof ConsentGrant>;

/**
 * Selective-disclosure vocabulary: the narrow questions a grantee may ask
 * instead of receiving raw Passport data. Only questions Flow's current data
 * can answer honestly are implemented server-side (see docs).
 */
export const DISCLOSURE_QUESTIONS = ["claim_valid", "credential_held"] as const;
export const DisclosureQuestion = z.enum(DISCLOSURE_QUESTIONS);

export const DisclosureResponse = z.object({
  question: DisclosureQuestion,
  grant_id: Uuid,
  answer: z.boolean(),
  /** Present only when the grant's approved categories permit expiry disclosure. */
  expires_at: IsoTimestamp.nullable(),
  /** ISO time the answer was computed. Answers are point-in-time, not durable. */
  evaluated_at: IsoTimestamp,
});
export type DisclosureResponse = z.infer<typeof DisclosureResponse>;
