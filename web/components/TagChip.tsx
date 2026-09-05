import Link from "next/link";
import type { Tag } from "@/lib/types";

const CATEGORY_LABEL: Record<Tag["category"], string> = {
  genre: "ジャンル",
  theme: "テーマ",
  mood: "雰囲気",
  setting: "舞台",
};

export function TagChip({ tag, count }: { tag: Tag; count?: number }) {
  return (
    <Link
      href={`/tags/${tag.slug}/`}
      className="inline-flex items-center gap-2 rounded border border-border bg-surface px-2 py-1 text-sm hover:border-accent hover:text-accent"
      title={CATEGORY_LABEL[tag.category]}
    >
      <span>{tag.name}</span>
      {count !== undefined ? <span className="text-muted">{count}</span> : null}
    </Link>
  );
}
