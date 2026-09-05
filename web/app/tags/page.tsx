import type { Metadata } from "next";
import { TagChip } from "@/components/TagChip";
import { fetchTagsWithCounts } from "@/lib/data/tags";
import type { TagCategory, TagWithCount } from "@/lib/types";

export const metadata: Metadata = {
  title: "タグ一覧",
  description: "ジャンル・テーマ・雰囲気・舞台のタグから漫画を探す。",
};

const ORDER: { key: TagCategory; label: string }[] = [
  { key: "genre", label: "ジャンル" },
  { key: "theme", label: "テーマ" },
  { key: "mood", label: "雰囲気" },
  { key: "setting", label: "舞台" },
];

export default async function TagsPage() {
  const tags = await fetchTagsWithCounts();
  const grouped = new Map<TagCategory, TagWithCount[]>();
  for (const t of tags) grouped.set(t.category, [...(grouped.get(t.category) ?? []), t]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">タグ一覧</h1>
      {tags.length === 0 ? <p className="text-sm text-muted">まだタグがありません。</p> : null}
      {ORDER.map(({ key, label }) => {
        const items = grouped.get(key) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3">{label}</h2>
            <div className="flex flex-wrap gap-2">
              {items.map((t) => (
                <TagChip key={t.id} tag={t} count={t.workCount} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
