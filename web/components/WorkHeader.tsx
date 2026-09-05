import { BookCover } from "@/components/BookCover";
import { TagChip } from "@/components/TagChip";
import type { TagWithWeight } from "@/lib/types";

export interface WorkHeaderProps {
  title: string;
  authors: string[];
  publisher: string | null;
  coverUrl: string | null;
  synopsis: string | null;
  volumeCount?: number;
  firstSalesDate?: string | null;
  tags?: TagWithWeight[];
  badge?: string;
}

export function WorkHeader(props: WorkHeaderProps) {
  const { title, authors, publisher, coverUrl, synopsis, volumeCount, firstSalesDate, tags = [], badge } = props;
  return (
    <section className="work-detail-header flex flex-row gap-4 sm:gap-6">
      <div className="w-20 sm:w-28 shrink-0">
        <BookCover title={title} authors={authors} src={coverUrl} />
      </div>
      <div className="flex-1 min-w-0">
        {badge ? <span className="inline-block text-xs rounded bg-accent-soft text-accent px-2 py-0.5 mb-2">{badge}</span> : null}
        <h1 className="text-xl sm:text-2xl font-bold leading-snug tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          {authors.join("、")}
          {publisher ? ` / ${publisher}` : ""}
          {volumeCount ? ` / 全${volumeCount}巻以上` : ""}
          {firstSalesDate ? ` / ${firstSalesDate.slice(0, 4)}年〜` : ""}
        </p>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((t) => (
              <TagChip key={t.id} tag={t} />
            ))}
          </div>
        ) : null}
        {synopsis ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">{synopsis}</p> : null}
      </div>
    </section>
  );
}
