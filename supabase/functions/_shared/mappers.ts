import type {
  Rating,
  ReviewRow,
  ReviewWithStatus,
  WorkRow,
  WorkSummary,
} from "./types.ts";

/** DB 行（snake_case）→ レスポンス型（camelCase）。 */

export function workRowToSummary(row: WorkRow): WorkSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    authors: row.authors,
    coverUrl: row.cover_url,
    reviewCount: row.review_count,
    status: row.status,
  };
}

export function reviewRowToReview(row: ReviewRow): ReviewWithStatus {
  return {
    id: row.id,
    workId: row.work_id,
    nickname: row.nickname,
    body: row.body,
    rating: row.rating as Rating,
    hasSpoiler: row.has_spoiler,
    createdAt: row.created_at,
    status: row.status,
  };
}

/** `works` から WorkSummary を組むときの select 列。 */
export const WORK_SUMMARY_COLUMNS =
  "id,slug,title,authors,cover_url,review_count,status";

/** `reviews` からレスポンスを組むときの select 列。 */
export const REVIEW_COLUMNS =
  "id,work_id,nickname,body,rating,has_spoiler,status,created_at";
