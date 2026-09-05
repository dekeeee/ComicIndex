import { SimilarVoteButton } from "@/components/SimilarVoteButton";
import { SuggestSimilarForm } from "@/components/SuggestSimilarForm";
import { WorkCard } from "@/components/WorkCard";
import type { SimilarWork } from "@/lib/types";

export function SimilarWorks({ items, fromWorkId }: { items: SimilarWork[]; fromWorkId: string }) {
  return (
    <section>
      <h2 className="section-title mb-3">似ている漫画</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">まだ似ている作品が見つかっていません。下の欄から提案できます。</p>
      ) : (
        <div className="books-grid grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {items.map((w) => (
            <div key={w.id} className="min-w-0">
              <WorkCard work={w}>
                <SimilarVoteButton fromWorkId={fromWorkId} toWorkId={w.id} initialCount={w.voteCount} />
              </WorkCard>
            </div>
          ))}
        </div>
      )}
      <SuggestSimilarForm fromWorkId={fromWorkId} />
    </section>
  );
}
