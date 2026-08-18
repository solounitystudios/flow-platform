import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100/80 bg-white/80 backdrop-blur-md dark:border-ink-800/80 dark:bg-ink-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-flow-gradient text-sm font-black text-white">F</span>
          <span className="text-lg font-black tracking-tight text-ink-900 dark:text-white">FLOW</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-600 dark:text-ink-300 md:flex">
          <Link href="/#passport" className="hover:text-ink-900 dark:hover:text-white">Passport</Link>
          <Link href="/#opportunities" className="hover:text-ink-900 dark:hover:text-white">Opportunities</Link>
          <Link href="/#business" className="hover:text-ink-900 dark:hover:text-white">For Business</Link>
          <Link href="/#cities" className="hover:text-ink-900 dark:hover:text-white">Cities</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="sm">Log in</Button>
          <Button href="/signup" size="sm">Join FLOW</Button>
        </div>
      </div>
    </header>
  );
}
