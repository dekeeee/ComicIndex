"use client";

import { useState } from "react";
import { reportReview } from "@/lib/api/reports";
import type { ReportReason } from "@/lib/types";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "スパム・宣伝" },
  { value: "spoiler", label: "ネタバレ指定なしのネタバレ" },
  { value: "abuse", label: "誹謗中傷" },
  { value: "copyright", label: "著作権侵害" },
  { value: "other", label: "その他" },
];

export function ReportButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    const result = await reportReview(reviewId, reason);
    if (result.ok) {
      setDone(true);
      setMessage(result.data.hidden ? "通報を受け付け、非表示にしました" : "通報を受け付けました");
    } else {
      setMessage(result.status === 409 ? "通報済みです" : result.message);
    }
    setOpen(false);
  }

  if (done || message) return <span className="text-xs text-muted">{message}</span>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted hover:text-accent">
        通報
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} className="rounded border border-border bg-background px-1 py-0.5">
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button type="button" onClick={submit} className="rounded border border-border px-2 py-0.5 hover:border-accent">
        送信
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-muted">
        取消
      </button>
    </span>
  );
}
