import { requireSecureAdmin } from "@/lib/admin/auth";
import { TestLabDashboard } from "@/components/admin/TestLabDashboard";
import { TEST_LAB_AGENTS } from "@/lib/admin/test-lab/agents";
import { TEST_LAB_SUITES } from "@/lib/admin/test-lab/suites";

export default async function TestLabPage() {
  // (secure) layout already calls requireSecureAdmin(), but every page and
  // Server Action under this route group re-checks it directly too —
  // defense in depth for page rendering, not reliance on the layout alone
  // (same convention as app/admin/(secure)/evidence/page.tsx and
  // app/admin/(secure)/verification/page.tsx).
  await requireSecureAdmin();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-900 dark:text-white">FLOW Test Lab</h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Phase 1 — a deterministic, in-process regression runner. No suite here writes to the database or calls a
          shell command; every check is a pure function call, safe to run against production at any time.
        </p>
      </div>
      <TestLabDashboard
        agents={TEST_LAB_AGENTS.map((a) => ({ id: a.id, name: a.name, description: a.description, safety: a.safety }))}
        suites={TEST_LAB_SUITES}
      />
    </div>
  );
}
