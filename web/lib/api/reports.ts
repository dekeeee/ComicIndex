import { callFunction } from "@/lib/api/client";
import type { ApiResult, ReportReason } from "@/lib/types";

export function reportReview(reviewId: string, reason: ReportReason): Promise<ApiResult<{ hidden: boolean }>> {
  return callFunction<{ hidden: boolean }>("report-review", { method: "POST", body: { reviewId, reason } });
}
