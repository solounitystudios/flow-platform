import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS } from "@/components/admin/AdminNav";

/**
 * Authorization boundaries of the Connections Center, checked structurally.
 * (Row-level access itself is pinned in tests/db/passport_v2_connections_read.test.sql;
 * these tests pin that the app never works around it.)
 */

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const PAGES = ["app/admin/(gated)/(secure)/connections/page.tsx", "app/admin/(gated)/(secure)/connections/[connector]/page.tsx"];

describe("Connections Center pages are behind the AAL2 admin gate", () => {
  it("live inside the (secure) admin route group, whose layout enforces AAL2", () => {
    for (const page of PAGES) expect(page).toContain("(secure)");
    expect(read("app/admin/(gated)/(secure)/layout.tsx")).toContain("requireSecureAdmin");
  });

  it("each page ALSO calls requireSecureAdmin() itself, before touching any data", () => {
    for (const page of PAGES) {
      const src = read(page);
      const gate = src.indexOf("await requireSecureAdmin()");
      expect(gate, page).toBeGreaterThan(-1);
      for (const dataCall of ["readIntegrationConnections", "readIntegrationEvents", "createClient()"]) {
        const at = src.indexOf(`${dataCall}`, src.indexOf("export default"));
        if (at !== -1) expect(gate, `${page}: ${dataCall}`).toBeLessThan(at);
      }
    }
  });

  it("is reachable from the admin nav, and no member-facing route exposes connections", () => {
    expect(ADMIN_NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === "/admin/connections")).toBe(true);
    for (const forbidden of ["app/(app)/passport/connections", "app/(app)/settings/connections", "app/p/[username]/connections"]) expect(fs.existsSync(path.join(ROOT, forbidden)), forbidden).toBe(false);
  });
});

describe("the read path is the caller's own session, read-only", () => {
  const SURFACE = [
    "lib/passport/data/connections.ts",
    "lib/passport/domain/connections-center.ts",
    ...walk("components/passport/connections"),
    ...PAGES,
  ];

  it("never creates or holds the service-role client, and never reads its key", () => {
    for (const file of SURFACE) {
      expect(read(file), file).not.toMatch(/createGatewayServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it("only the two pages touch the service-client module, and only for its boolean credentials check", () => {
    for (const file of SURFACE.filter((f) => !PAGES.includes(f))) expect(read(file), file).not.toContain("service-client");
    for (const page of PAGES) {
      const imports = [...read(page).matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/lib\/passport\/gateway\/service-client"/g)].map((m) => m[1].trim());
      expect(imports, page).toEqual(["gatewayServiceCredentialsPresent"]);
    }
  });

  it("only asks whether service credentials exist (a boolean); it never holds a client", () => {
    for (const page of PAGES) {
      const src = read(page);
      expect(src).toContain("gatewayServiceCredentialsPresent");
      expect(src).not.toContain("createGatewayServiceClient");
    }
    const fn = read("lib/passport/gateway/service-client.ts");
    expect(fn).toMatch(/export function gatewayServiceCredentialsPresent\(\): boolean/);
  });

  it("performs no writes and calls no RPC", () => {
    for (const file of SURFACE) expect(read(file), file).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it("the summary of gateway config is constructed by explicit field picks: no `secret` property is ever read from an entry", () => {
    const src = read("lib/passport/gateway/config-summary.ts");
    expect(src).not.toMatch(/entry\.secret|\.secret\b/);
  });

  it("no component or page renders a raw error message, payload, or header", () => {
    for (const file of [...walk("components/passport/connections"), ...PAGES]) {
      expect(read(file), file).not.toMatch(/\.payload\b|\.headers\b|error\.message|\.stack\b|JSON\.stringify/);
    }
  });
});

describe("no new database surface", () => {
  it("adds no migration for the Connections Center", () => {
    const names = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
    // Compare on the timestamp prefix only. The one migration allowed after the claim-explanation one is the
    // independent security review's fix migration; the Connections Center itself added none.
    expect(names.filter((n) => n.slice(0, 14) > "20260919120600" && !/_passport_v2_review_fixes\.sql$/.test(n))).toEqual([]);
    expect(names.filter((n) => /connection/i.test(n) && n.slice(0, 14) > "20260919120500")).toEqual([]);
  });
});
