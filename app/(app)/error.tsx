"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="font-semibold text-ink-900 dark:text-white">Something went wrong</p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">
        This page hit an unexpected error. Try again, or head back to your dashboard.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Try again
        </Button>
        <Button href="/dashboard" variant="outline" size="sm">
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
