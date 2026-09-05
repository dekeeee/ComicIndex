"use client";

import { useState } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { postReview } from "@/lib/api/reviews";
import { demoEnabled } from "@/lib/demo";
import { config } from "@/lib/config";
import type { Review } from "@/lib/types";
import { charLength, validateReviewInput } from "@/lib/validation";

export function ReviewForm({ workId, onPosted }: { workId: string; onPosted: (review: Review) => void }) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(0);
  const [hasSpoiler, setHasSpoiler] = useState(false);
  const [token, setToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const input = { workId, nickname, body, rating, hasSpoiler };
    const validation = validateReviewInput(input);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    if (!demoEnabled && config.turnstileSiteKey && !token) {
      setMessage("確認処理中です。数秒待ってからもう一度押してください。");
      return;
    }
    setSending(true);
    const result = await postReview(input, token);
    setSending(false);
    if (!result.ok) {
      setMessage(result.status === 429 ? "投稿が多すぎます。しばらく待ってから投稿してください。" : result.message);
      setToken("");
      setTurnstileKey((k) => k + 1);
      return;
    }
    onPosted(result.data.review);
    setBody("");
    setRating(0);
    setHasSpoiler(false);
    setToken("");
    setTurnstileKey((k) => k + 1);
    setOpen(false);
    setMessage(result.data.review.status === "pending" ? "投稿を受け付けました。内容確認後に公開されます。" : "投稿しました。");
  }

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white">
          レビューを書く
        </button>
        {message ? <p className="mt-2 text-sm text-muted">{message}</p> : null}
      </div>
    );
  }

  const bodyLen = charLength(body);
  return (
    <form onSubmit={onSubmit} className="rounded border border-border bg-surface p-4 text-sm space-y-3">
      <div>
        <label className="block text-xs text-muted mb-1">評価</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={`${n}点`}
              className={`text-2xl leading-none ${n <= rating ? "text-accent" : "text-border"}`}
            >
              ★
            </button>
          ))}
        </div>
        {errors.rating ? <p className="text-xs text-accent">{errors.rating}</p> : null}
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">ニックネーム（任意・{config.nicknameMaxLength}文字まで）</label>
        <input aria-label="ニックネーム" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1" />
        {errors.nickname ? <p className="text-xs text-accent">{errors.nickname}</p> : null}
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">
          本文（{config.reviewMinLength}〜{config.reviewMaxLength}文字）
          <span className="ml-2">{bodyLen}文字</span>
        </label>
        <textarea aria-label="レビュー本文" value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded border border-border bg-background px-2 py-1" />
        {errors.body ? <p className="text-xs text-accent">{errors.body}</p> : null}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={hasSpoiler} onChange={(e) => setHasSpoiler(e.target.checked)} />
        ネタバレを含む
      </label>
      {!demoEnabled && <TurnstileWidget onToken={setToken} resetKey={turnstileKey} />}
      {message ? <p className="text-xs text-accent">{message}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={sending} className="rounded bg-accent px-4 py-2 font-semibold text-white disabled:opacity-50">
          投稿する
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-border px-4 py-2">
          やめる
        </button>
      </div>
    </form>
  );
}
