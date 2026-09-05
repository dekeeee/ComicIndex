import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { StarRating } from "@/components/StarRating";
import { TagChip } from "@/components/TagChip";
import { WorkCard } from "@/components/WorkCard";
import { config } from "@/lib/config";
import { fetchLatestReviews } from "@/lib/data/reviews";
import { fetchTagsWithCounts } from "@/lib/data/tags";
import { fetchFeaturedWorks } from "@/lib/data/works";
import { workPath } from "@/lib/seo";

const TOP_TAG_COUNT = 24;

export default async function TopPage() {
  const [featured, latest, tags] = await Promise.all([
    fetchFeaturedWorks(config.featuredCount),
    fetchLatestReviews(config.latestReviewCount),
    fetchTagsWithCounts(),
  ]);

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-lg font-bold">漫画のレビュー・似ている作品を探す</h1>
        <form action="/search/" method="get" role="search" className="search-shell flex gap-2 mt-3">
          <input type="search" name="q" aria-label="作品名・作者名で検索" placeholder="作品名・作者名" className="min-w-0 flex-1 rounded border border-border px-3 py-2 text-base" />
          <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-semibold text-white">検索</button>
        </form>
      </section>

      <section>
        <h2 className="section-title mb-3">注目の作品</h2>
        {featured.length === 0 ? (
          <p className="text-sm text-muted">まだ作品がありません。</p>
        ) : (
          <div className="books-grid grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {featured.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">新着レビュー</h2>
        {latest.length === 0 ? (
          <p className="text-sm text-muted">まだレビューがありません。</p>
        ) : (
          <ul className="divide-y divide-border">
            {latest.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <Link href={workPath(r.work.slug)} className="font-semibold hover:text-accent">
                  {r.work.title}
                </Link>
                <span className="ml-2">
                  <StarRating value={r.rating} />
                </span>
                <span className="ml-2 text-xs text-muted">{r.nickname}</span>
                <p className="mt-1 leading-relaxed text-muted line-clamp-2">{r.hasSpoiler ? "（ネタバレあり）" : r.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title mb-3">タグから探す</h2>
        <div className="flex flex-wrap gap-2">
          {tags.slice(0, TOP_TAG_COUNT).map((t) => (
            <TagChip key={t.id} tag={t} count={t.workCount} />
          ))}
          <Link href="/tags/" className="text-xs text-accent underline self-center">
            すべてのタグ
          </Link>
        </div>
      </section>

      <AdSlot placement="tag_bottom" />
    </div>
  );
}
