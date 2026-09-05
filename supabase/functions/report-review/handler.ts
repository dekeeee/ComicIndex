import {
  error,
  guarded,
  json,
  preflight,
  rateLimited,
  readJsonObject,
  requireMethod,
} from "../_shared/response.ts";
import type { PostKind, RateLimitResult, ReportReason } from "../_shared/types.ts";
import { isReportReason, isUuid } from "../_shared/validation.ts";

export type InsertOutcome = "inserted" | "duplicate";

export interface ReportRepo {
  reviewExists(reviewId: string): Promise<boolean>;
  /** unique (review_id, ip_hash) 違反なら "duplicate"。 */
  insertReport(
    reviewId: string,
    reason: ReportReason,
    ipHash: string,
  ): Promise<InsertOutcome>;
  countReports(reviewId: string): Promise<number>;
  /** `report_count` を更新し、`hide` なら `status = 'hidden'` にする。 */
  recordReportCount(reviewId: string, count: number, hide: boolean): Promise<void>;
}

export interface ReportReviewDeps {
  ipHash(req: Request): Promise<string>;
  checkRateLimit(kind: PostKind, ipHash: string): Promise<RateLimitResult>;
  repo: ReportRepo;
  /** `REPORT_HIDE_THRESHOLD`。テストで差し替え可能。 */
  hideThreshold: number;
}

export type ReportInput =
  | { ok: true; reviewId: string; reason: ReportReason }
  | { ok: false; errors: Record<string, string> };

/** 入力の形式検証（純粋関数）。reason は `validation-rules.json` の一覧に限る。 */
export function parseReportInput(raw: Record<string, unknown>): ReportInput {
  const errors: Record<string, string> = {};
  const reviewId = raw["reviewId"];
  const reason = raw["reason"];
  if (!isUuid(reviewId)) errors["reviewId"] = "must be a uuid";
  if (!isReportReason(reason)) errors["reason"] = "is not an allowed reason";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, reviewId: reviewId as string, reason: reason as ReportReason };
}

/** しきい値判定（純粋関数）。 */
export function shouldHide(reportCount: number, threshold: number): boolean {
  return reportCount >= threshold;
}

/**
 * POST { reviewId, reason }
 * validation → 存在確認 → rate limit → insert（重複は 409）→ count ≥ threshold なら hidden
 * 201 { hidden } / 400 / 404 / 409 / 429
 */
export function handle(req: Request, deps: ReportReviewDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "POST");
    if (wrongMethod) return wrongMethod;

    const raw = await readJsonObject(req);
    if (raw === null) return error(400, "invalid_json", "Body must be a JSON object.");

    const input = parseReportInput(raw);
    if (!input.ok) {
      return json(400, {
        code: "validation_failed",
        message: "Invalid report input.",
        errors: input.errors,
      });
    }

    if (!(await deps.repo.reviewExists(input.reviewId))) {
      return error(404, "review_not_found", "Review not found.");
    }

    const hash = await deps.ipHash(req);
    const limit = await deps.checkRateLimit("report", hash);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    const outcome = await deps.repo.insertReport(input.reviewId, input.reason, hash);
    if (outcome === "duplicate") {
      return error(409, "already_reported", "You have already reported this review.");
    }

    const count = await deps.repo.countReports(input.reviewId);
    const hidden = shouldHide(count, deps.hideThreshold);
    await deps.repo.recordReportCount(input.reviewId, count, hidden);

    return json(201, { hidden });
  });
}
