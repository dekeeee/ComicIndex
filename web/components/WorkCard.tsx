import Link from "next/link";
import { BookCover } from "@/components/BookCover";
import { workPath } from "@/lib/seo";
import type { WorkSummary } from "@/lib/types";

export function WorkCard({ work, children }: { work: WorkSummary; children?: React.ReactNode }) {
  return (
    <div className="work-card flex flex-col gap-3 min-w-0 w-full">
      <Link href={work.status === "pending" ? `/works/pending/?id=${work.id}` : workPath(work.slug)} className="work-card-link">
        <BookCover title={work.title} authors={work.authors} src={work.coverUrl} />
        <div className="min-w-0">
        <p className="text-sm font-bold leading-relaxed line-clamp-2">{work.title}</p>
        <p className="mt-1 text-xs text-muted line-clamp-1">{work.authors.join("、")}</p>
        <p className="mt-2 text-xs text-muted">レビュー <span className="font-semibold text-foreground">{work.reviewCount}</span>件</p>
        </div>
      </Link>
      {children}
    </div>
  );
}
