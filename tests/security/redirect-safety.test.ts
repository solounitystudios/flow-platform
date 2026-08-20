// Open-redirect guard regression coverage — every redirect that echoes a
// `next` query param (login, signup, auth callback, employer invite) relies
// on lib/redirect-safety.ts's isSafeInternalPath.
import { describe, expect, it } from "vitest";
import { isSafeInternalPath } from "@/lib/redirect-safety";

describe("isSafeInternalPath", () => {
  it("accepts a same-origin absolute path", () => {
    expect(isSafeInternalPath("/dashboard")).toBe(true);
    expect(isSafeInternalPath("/business/team")).toBe(true);
  });

  it("rejects a scheme-relative path (protocol-relative open redirect)", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("//evil.com/phish")).toBe(false);
  });

  it("rejects a fully-qualified external URL", () => {
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.com/dashboard")).toBe(false);
  });

  it("rejects a relative (non-rooted) path", () => {
    expect(isSafeInternalPath("dashboard")).toBe(false);
  });

  it("rejects empty/null/undefined", () => {
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
  });
});
