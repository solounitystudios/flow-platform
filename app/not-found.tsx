import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center dark:bg-ink-950">
      <Compass className="h-8 w-8 text-ink-300" />
      <p className="font-semibold text-ink-900 dark:text-white">Page not found</p>
      <p className="max-w-sm text-sm text-ink-500 dark:text-ink-400">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      <Link href="/" className="rounded-xl bg-flow-600 px-4 py-2 text-sm font-medium text-white hover:bg-flow-700">
        Go home
      </Link>
    </div>
  );
}
