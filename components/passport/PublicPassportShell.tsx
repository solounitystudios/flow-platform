import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/** Logged-out-friendly chrome shared by every public Passport page. */
export function PublicPassportShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50 dark:bg-ink-950">
      <header className="flex h-16 items-center justify-between border-b border-ink-100 px-5 dark:border-ink-800">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-flow-gradient text-sm font-black text-white">F</span>
          <span className="text-lg font-black tracking-tight text-ink-900 dark:text-white">FLOW</span>
        </Link>
        <Button href="/signup" size="sm">Join FLOW</Button>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-5 py-8">{children}</main>
    </div>
  );
}
