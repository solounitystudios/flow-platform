import { defineConfig } from "vitest/config";
import path from "node:path";

// FLOW Test Lab Phase 1 — unit/integration test runner config. Scoped to
// tests/unit and tests/security (pure logic, no Next.js/Supabase runtime,
// no credentials needed) — see tests/README.md for why tests/integration is
// deliberately excluded from the default run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
