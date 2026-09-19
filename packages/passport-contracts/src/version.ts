/**
 * Contract versioning.
 *
 * Every message that crosses a repository boundary carries `schema_version`
 * ("<major>.<minor>"). Rules:
 *   - Additive changes (new optional field, new enum value a receiver can
 *     safely ignore) bump MINOR. Receivers accept any minor of a supported
 *     major and ignore fields they don't know.
 *   - Breaking changes bump MAJOR. A receiver rejects an unsupported major
 *     with `unsupported_schema_version` rather than guessing.
 * `CONTRACT_PACKAGE_VERSION` is the npm-style version of this package; it
 * moves independently (docs, helpers) and is not sent on the wire.
 */
export const CONTRACT_PACKAGE_VERSION = "1.0.0";
export const PASSPORT_SCHEMA_VERSION = "1.0";
export const SUPPORTED_SCHEMA_MAJOR = 1;

export function parseSchemaVersion(value: unknown): { major: number; minor: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,4})\.(\d{1,4})$/.exec(value);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** True when `value` is a well-formed version whose major this package understands. */
export function isSchemaVersionSupported(value: unknown): boolean {
  const parsed = parseSchemaVersion(value);
  return parsed !== null && parsed.major === SUPPORTED_SCHEMA_MAJOR;
}
