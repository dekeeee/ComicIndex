import { callFunction } from "@/lib/api/client";
import type { ApiResult, Review, ReviewInput } from "@/lib/types";

export function postReview(input: ReviewInput, turnstileToken: string): Promise<ApiResult<{ review: Review }>> {
  return callFunction<{ review: Review }>("post-review", {
    method: "POST",
    body: { ...input, turnstileToken },
  });
}
