import { z } from "zod";
import { Uuid } from "./common";

/**
 * Everything a Passport can describe. The core contracts never assume the
 * subject is a human — a claim, evidence record or consent grant can attach
 * to any of these.
 *
 * Wire values are lowercase to match the rest of Flow's schema
 * ('profile_skill', 'creative_project', ...).
 *
 * `business` is a semantic alias: in Flow today the `organizations` row IS
 * the business entity, so persisted refs are canonicalised to `organization`
 * (see `canonicalSubjectType`) — otherwise one real entity could end up with
 * two Passports.
 */
export const SUBJECT_TYPES = [
  "person",
  "organization",
  "business",
  "program",
  "team",
  "vehicle",
  "asset",
  "venue",
  "event",
  "project",
  "agency",
  /** A Flow Activity (workshop, shift, class...) — a first-class participation object. */
  "activity",
] as const;

export const SubjectType = z.enum(SUBJECT_TYPES);
export type SubjectType = z.infer<typeof SubjectType>;

export const SubjectRef = z.object({ type: SubjectType, id: Uuid });
export type SubjectRef = z.infer<typeof SubjectRef>;

/** Folds semantic aliases into the persisted subject type. */
export function canonicalSubjectType(type: SubjectType): Exclude<SubjectType, "business"> {
  return type === "business" ? "organization" : type;
}

export function canonicalSubjectRef(ref: SubjectRef): SubjectRef {
  return { type: canonicalSubjectType(ref.type), id: ref.id };
}

export function sameSubject(a: SubjectRef, b: SubjectRef): boolean {
  const ca = canonicalSubjectRef(a);
  const cb = canonicalSubjectRef(b);
  return ca.type === cb.type && ca.id.toLowerCase() === cb.id.toLowerCase();
}

/** Who performed an action. `service` ids are client ids like 'flow_capture'. */
export const ACTOR_TYPES = ["person", "service", "system"] as const;
export const ActorRef = z.object({
  type: z.enum(ACTOR_TYPES),
  id: z.string().min(1).max(128),
});
export type ActorRef = z.infer<typeof ActorRef>;
