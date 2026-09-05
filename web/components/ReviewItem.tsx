"use client";

import { useState } from "react";
import { ReportButton } from "@/components/ReportButton";
import { StarRating } from "@/components/StarRating";
import type { Review } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function ReviewItem({ review }: { review: Review }) {
  const [revealed, setRevealed] = useState(!review.hasSpoiler);
  const pending = review.status === "pending";
  return (
    <article className="review-panel border-b border-border bg-surface py-4 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <StarRating value={review.rating} />
        <span className="font-semibold">{review.nickname}</span>
        <time className="text-xs text-muted" dateTime={review.createdAt}>
          {formatDate(review.createdAt)}
        </time>
        {review.hasSpoiler ? <span className="text-xs rounded bg-accent-soft text-accent px-1.5">ネタバレあり</span> : null}
        {pending ? <span className="text-xs rounded bg-border px-1.5">確認中</span> : null}
      </header>
      {revealed ? (
        <p className="mt-2 leading-relaxed whitespace-pre-line">{review.body}</p>
      ) : (
        <button type="button" onClick={() => setRevealed(true)} className="mt-2 text-accent underline">
          ネタバレを表示する
        </button>
      )}
      {!pending ? (
        <footer className="mt-2 flex justify-end">
          <ReportButton reviewId={review.id} />
        </footer>
      ) : null}
    </article>
  );
}
