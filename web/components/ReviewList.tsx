"use client";

import { demoEnabled } from "@/lib/demo";
import { useEffect, useState } from "react";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewItem } from "@/components/ReviewItem";
import { fetchReviewsSince, mergeReviews } from "@/lib/data/reviews";
import type { Review } from "@/lib/types";

/**
 * Renders the reviews baked in at build time, then tops up with anything posted since.
 * `builtAt` is the ISO timestamp of the build; reviews newer than it are fetched on mount.
 */
export function ReviewList({ workId, initialReviews, builtAt }: { workId: string; initialReviews: Review[]; builtAt: string }) {
  const [message, setMessage] = useState("");
  const [reviews, setReviews] = useState<Review[]>(initialReviews);

  useEffect(() => {
    let cancelled = false;
    fetchReviewsSince(workId, builtAt)
      .then((fresh) => {
        if (!cancelled && fresh.length > 0) setReviews((current) => mergeReviews(current, fresh));
      })
      .catch(() => {
        if (!cancelled && demoEnabled) setMessage("保存したレビューを読み込めません。ブラウザの保存設定を確認するか、デモをリセットしてください。");
      });
    return () => {
      cancelled = true;
    };
  }, [workId, builtAt]);

  return (
    <section>
      <h2 className="section-title mb-3">レビュー・口コミ（{reviews.length}件）</h2>
      {message && <p role="alert" className="text-sm text-accent">{message}</p>}
      <ReviewForm workId={workId} onPosted={(review) => setReviews((current) => mergeReviews([review], current))} />
      <div className="mt-4 space-y-3">
        {reviews.length === 0 ? <p className="text-sm text-muted">まだレビューがありません。最初の一人になりませんか？</p> : null}
        {reviews.map((r) => (
          <ReviewItem key={r.id} review={r} />
        ))}
      </div>
    </section>
  );
}
