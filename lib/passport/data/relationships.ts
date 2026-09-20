import type { SupabaseClient } from "@supabase/supabase-js";
import type { Relationship, SubjectRef } from "@flow/passport-contracts";
import type { Database } from "@/lib/database.types";
import { relationshipFromLegacy, relationshipFromNative, sortRelationships } from "@/lib/passport/domain";

/**
 * Every relationship a subject is part of — native rows plus the legacy
 * memberships/attendance/participation/connections adapted read-only — as one
 * canonical list. Visibility is decided entirely by RLS on the source tables
 * (the legacy view is security_invoker), so this returns only what the caller
 * could already see.
 */
export async function getRelationshipsForSubject(supabase: SupabaseClient<Database>, subject: SubjectRef): Promise<Relationship[]> {
  const type = subject.type === "business" ? "organization" : subject.type;

  const [native, legacy] = await Promise.all([
    supabase
      .from("passport_relationships")
      .select("*")
      .or(`and(from_type.eq.${type},from_id.eq.${subject.id}),and(to_type.eq.${type},to_id.eq.${subject.id})`),
    supabase
      .from("passport_relationships_legacy")
      .select("*")
      .or(`and(from_type.eq.${type},from_id.eq.${subject.id}),and(to_type.eq.${type},to_id.eq.${subject.id})`),
  ]);

  if (native.error) console.error("[getRelationshipsForSubject:native]", native.error.message);
  if (legacy.error) console.error("[getRelationshipsForSubject:legacy]", legacy.error.message);

  const rows: Relationship[] = [
    ...(native.data ?? []).map(relationshipFromNative),
    ...(legacy.data ?? []).map(relationshipFromLegacy).filter((row): row is NonNullable<typeof row> => row !== null),
  ];
  return sortRelationships(rows);
}
