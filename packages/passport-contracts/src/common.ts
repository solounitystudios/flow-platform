import { z } from "zod";

/** RFC 4122 uuid — Flow's own row ids (gen_random_uuid()). */
export const Uuid = z.uuid();

/** RFC 3339 timestamp with an explicit offset — never a bare local time. */
export const IsoTimestamp = z.iso.datetime({ offset: true });

/**
 * An id issued by a system other than Flow's database (e.g. Capture's
 * session/artifact ids). Deliberately not a uuid: Flow must not dictate the
 * shape of another system's identifiers.
 */
export const OpaqueId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:\-]+$/, "must be 1-128 chars of [A-Za-z0-9._:-]");

export const SchemaVersionString = z.string().regex(/^\d{1,4}\.\d{1,4}$/, "must look like '1.0'");

export const CorrelationId = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:\-]+$/);
export const IdempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9._:\-]+$/);

export const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase hex sha256");

/**
 * Small, flat, bounded metadata bag. Bounded on purpose: Passport stores
 * references and provenance, never a place to smuggle blobs or documents.
 */
export const MetadataBag = z
  .record(z.string().min(1).max(64), z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]))
  .refine((bag) => Object.keys(bag).length <= 50, "at most 50 keys");
