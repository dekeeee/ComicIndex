/**
 * Edge Function 内部型。`docs/comicomi-data-design.md` §5 の TypeScript 型と同じ形を保つ。
 * 外部 API（楽天）や DB 行はここで定義した内部型に変換してから扱う。
 */

export type WorkStatus = "pending" | "published" | "rejected";
export type ReviewStatus = "visible" | "pending" | "hidden";
export type ReportReason = "spam" | "spoiler" | "abuse" | "copyright" | "other";
export type PostKind = "review" | "vote" | "report" | "search" | "register";
export type Rating = 1 | 2 | 3 | 4 | 5;

export interface RateLimit {
  windowSec: number;
  max: number;
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export interface ReviewInput {
  workId: string;
  nickname?: string;
  body: string;
  rating: number;
  hasSpoiler: boolean;
}

/** web/lib/types.ts の `Review` と同形。Edge Function のレスポンスでは `status` を追加して返す。 */
export interface Review {
  id: string;
  workId: string;
  nickname: string;
  body: string;
  rating: Rating;
  hasSpoiler: boolean;
  createdAt: string;
}

export interface ReviewWithStatus extends Review {
  status: ReviewStatus;
}

export interface WorkSummary {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  reviewCount: number;
  status: WorkStatus;
}

/** web 側 `RakutenCandidate` のスーパーセット。 */
export interface RakutenCandidate {
  itemCode: string;
  title: string;
  titleKana: string | null;
  author: string;
  imageUrl: string;
  salesDate: string;
  isbn: string | null;
  publisher: string | null;
  caption: string | null;
  affiliateUrl: string;
  genreIds: string[];
}

export interface SearchResult {
  db: WorkSummary[];
  rakuten: RakutenCandidate[];
}

/** エラーレスポンス本文。web 側 `ApiResult` の `{ code, message }` に対応。 */
export interface ErrorBody {
  code: string;
  message: string;
}

// ---- DB 行（snake_case）。repo 層でのみ触り、handler へは内部型に変換して渡す ----

export interface WorkRow {
  id: string;
  slug: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  review_count: number;
  status: WorkStatus;
}

export interface ReviewRow {
  id: string;
  work_id: string;
  nickname: string;
  body: string;
  rating: number;
  has_spoiler: boolean;
  status: ReviewStatus;
  created_at: string;
}
