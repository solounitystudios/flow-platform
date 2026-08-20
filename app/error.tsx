"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center dark:bg-ink-950">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="font-semibold text-ink-900 dark:text-white">Something went wrong</p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">Try again, or head back home.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="rounded-xl bg-flow-600 px-4 py-2 text-sm font-medium text-white hover:bg-flow-700">
          Try again
        </button>
        <Link href="/" className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-ink-50 dark:border-ink-700 dark:text-white dark:hover:bg-ink-800">
          Go home
        </Link>
      </div>
    </div>
  );
}
