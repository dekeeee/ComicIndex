import { AdSlot } from "@/components/AdSlot";
import { Pagination } from "@/components/Pagination";
import { WorkCard } from "@/components/WorkCard";
import type { Paginated, Tag, WorkSummary } from "@/lib/types";

export function tagPageHref(slug: string, page: number): string {
  return page <= 1 ? `/tags/${slug}/` : `/tags/${slug}/page/${page}/`;
}

export function TagWorksList({ tag, result }: { tag: Tag; result: Paginated<WorkSummary> }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">「{tag.name}」の漫画</h1>
        <p className="text-sm text-muted">
          {result.total}作品 / {result.page} ページ目
        </p>
      </header>
      {result.items.length === 0 ? (
        <p className="text-sm text-muted">このタグの作品はまだありません。</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {result.items.map((w) => (
            <WorkCard key={w.id} work={w} />
          ))}
        </div>
      )}
      <Pagination current={result.page} total={result.pageCount} hrefFor={(n) => tagPageHref(tag.slug, n)} />
      <AdSlot placement="tag_bottom" />
    </div>
  );
}
