import type { PendingWorkRow, ReviewPublicRow, TagRow, WorkSummaryRow } from "@/lib/db-rows";
import type { PendingWork, Rating, Review, Tag, WorkSummary } from "@/lib/types";

export function toWorkSummary(row: WorkSummaryRow): WorkSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    authors: row.authors ?? [],
    coverUrl: row.cover_url,
    reviewCount: row.review_count ?? 0,
    status: row.status,
  };
}

export function toTag(row: TagRow): Tag {
  return { id: row.id, slug: row.slug, name: row.name, category: row.category };
}

export function toRating(value: number): Rating {
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  return clamped as Rating;
}

export function toReview(row: ReviewPublicRow): Review {
  const review: Review = {
    id: row.id,
    workId: row.work_id,
    nickname: row.nickname,
    body: row.body,
    rating: toRating(row.rating),
    hasSpoiler: row.has_spoiler,
    createdAt: row.created_at,
  };
  if (row.status) review.status = row.status;
  return review;
}

export function toPendingWork(row: PendingWorkRow): PendingWork {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    authors: row.authors ?? [],
    coverUrl: row.cover_url,
    publisher: row.publisher,
    synopsis: row.synopsis,
    affiliateUrlRakuten: row.affiliate_url_rakuten,
  };
}
