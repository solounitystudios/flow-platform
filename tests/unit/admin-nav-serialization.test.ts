import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS } from "@/components/admin/AdminNav";

/**
 * AdminNav is a Server Component; ADMIN_NAV_GROUPS crosses into SidebarShell
 * ("use client") as a prop. React can only serialize plain data across that
 * boundary — a Lucide icon component reference (a function) throws "Functions
 * cannot be passed directly to Client Components". Every nav item's `icon`
 * must stay a plain string key that SidebarShell resolves client-side.
 */
describe("ADMIN_NAV_GROUPS RSC serialization safety", () => {
  const allItems = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

  it("has at least one nav item to check", () => {
    expect(allItems.length).toBeGreaterThan(0);
  });

  it("every item survives a JSON round-trip unchanged (no functions/components)", () => {
    for (const item of allItems) {
      const roundTripped = JSON.parse(JSON.stringify(item));
      expect(roundTripped).toEqual(item);
    }
  });

  it("every icon is a plain string key, never a component/function reference", () => {
    for (const item of allItems) {
      if (item.icon !== undefined) {
        expect(typeof item.icon).toBe("string");
      }
    }
  });
});
