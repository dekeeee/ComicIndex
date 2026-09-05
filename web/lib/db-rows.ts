import type { ReviewStatus, TagCategory, WorkStatus } from "@/lib/types";

/** Raw row shapes as returned by PostgREST. Converted to lib/types before use. */

export interface WorkRow {
  id: string;
  slug: string;
  title: string;
  title_kana: string | null;
  authors: string[];
  publisher: string | null;
  synopsis: string | null;
  cover_url: string | null;
  first_sales_date: string | null;
  volume_count: number;
  affiliate_url_rakuten: string;
  affiliate_url_amazon: string | null;
  status: WorkStatus;
  review_count: number;
}

export type WorkSummaryRow = Pick<WorkRow, "id" | "slug" | "title" | "authors" | "cover_url" | "review_count" | "status">;

export const WORK_SUMMARY_COLUMNS = "id, slug, title, authors, cover_url, review_count, status";
export const WORK_DETAIL_COLUMNS =
  "id, slug, title, title_kana, authors, publisher, synopsis, cover_url, first_sales_date, volume_count, affiliate_url_rakuten, affiliate_url_amazon, status, review_count";

export interface TagRow {
  id: number;
  slug: string;
  name: string;
  category: TagCategory;
}

export interface WorkTagRow {
  work_id: string;
  weight: number;
  tags: TagRow | null;
}

export interface SimilarityRow {
  from_work_id: string;
  to_work_id: string;
  rank: number;
  score: number;
}

export interface VoteCountRow {
  from_work_id: string;
  to_work_id: string;
  votes: number;
}

export interface ReviewPublicRow {
  id: string;
  work_id: string;
  nickname: string;
  body: string;
  rating: number;
  has_spoiler: boolean;
  created_at: string;
  status?: ReviewStatus;
}

export interface PendingWorkRow {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  publisher: string | null;
  synopsis: string | null;
  affiliate_url_rakuten: string;
}
