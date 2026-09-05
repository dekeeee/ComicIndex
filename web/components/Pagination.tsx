import Link from "next/link";

export function Pagination({ current, total, hrefFor }: { current: number; total: number; hrefFor: (n: number) => string }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1).filter((n) => n === 1 || n === total || Math.abs(n - current) <= 2);
  const items: (number | "gap")[] = [];
  for (const n of pages) {
    const prev = items[items.length - 1];
    if (typeof prev === "number" && n - prev > 1) items.push("gap");
    items.push(n);
  }
  return (
    <nav aria-label="ページ" className="flex flex-wrap items-center gap-1 text-sm">
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} className="rounded border border-border px-2 py-1">
          前へ
        </Link>
      ) : null}
      {items.map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted">
            …
          </span>
        ) : item === current ? (
          <span key={item} className="rounded bg-accent px-2 py-1 text-white">
            {item}
          </span>
        ) : (
          <Link key={item} href={hrefFor(item)} className="rounded border border-border px-2 py-1">
            {item}
          </Link>
        ),
      )}
      {current < total ? (
        <Link href={hrefFor(current + 1)} className="rounded border border-border px-2 py-1">
          次へ
        </Link>
      ) : null}
    </nav>
  );
}
