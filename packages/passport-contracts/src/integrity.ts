import { sha256Hex } from "./crypto";
import type { ArtifactRef } from "./evidence";

/**
 * Canonical digest over an artifact list, so a producer and Passport can
 * agree on "these are exactly the artifacts I meant" without shipping the
 * bytes. Order-independent (sorted by artifact_id) and covers only the
 * fields that identify content: id, media type, size and sha256.
 *
 * This is INTEGRITY metadata (tamper/transit detection), not authenticity —
 * it says nothing about whether the artifacts' contents are true.
 */
export async function computeArtifactsDigest(artifacts: ReadonlyArray<Pick<ArtifactRef, "artifact_id" | "media_type" | "byte_size" | "sha256">>): Promise<string> {
  const lines = [...artifacts]
    .sort((a, b) => (a.artifact_id < b.artifact_id ? -1 : a.artifact_id > b.artifact_id ? 1 : 0))
    .map((a) => [a.artifact_id, a.media_type.toLowerCase(), a.byte_size ?? "", a.sha256 ?? ""].join("|"));
  return sha256Hex(lines.join("\n"));
}
