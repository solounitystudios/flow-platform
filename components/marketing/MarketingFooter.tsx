import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-ink-100 py-10 dark:border-ink-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-flow-gradient text-xs font-black text-white">F</span>
          <span className="font-black text-ink-900 dark:text-white">FLOW</span>
          <span className="text-sm text-ink-400">— Buffalo, NY · Founding City</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500 dark:text-ink-400">
          <Link href="/gigs" className="hover:text-ink-900 dark:hover:text-white">Gigs</Link>
          <Link href="/events" className="hover:text-ink-900 dark:hover:text-white">Events</Link>
          <Link href="/business" className="hover:text-ink-900 dark:hover:text-white">Business</Link>
          <Link href="/signup" className="hover:text-ink-900 dark:hover:text-white">Join</Link>
        </nav>
      </div>
    </footer>
  );
}
