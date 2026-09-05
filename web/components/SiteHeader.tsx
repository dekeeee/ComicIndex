import Link from "next/link";
import { config } from "@/lib/config";

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-14 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
          {config.siteName}
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5 text-sm font-semibold">
          <Link href="/tags/" className="rounded px-3 py-2 hover:bg-accent-soft hover:text-accent">
            タグ
          </Link>
          <Link href="/search/" className="rounded px-3 py-2 hover:bg-accent-soft hover:text-accent">
            検索
          </Link>
        </nav>
      </div>
    </header>
  );
}
