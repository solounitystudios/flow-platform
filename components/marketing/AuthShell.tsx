import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50 dark:bg-ink-950">
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-flow-gradient text-base font-black text-white">F</span>
          <span className="text-xl font-black tracking-tight text-ink-900 dark:text-white">FLOW</span>
        </Link>
        <div className="w-full max-w-sm rounded-3xl border border-ink-100 bg-white p-7 shadow-card dark:border-ink-800 dark:bg-ink-900">
          <h1 className="text-2xl font-bold text-ink-900 dark:text-white">{title}</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-sm text-ink-500 dark:text-ink-400">{footer}</p>
      </div>
    </div>
  );
}
